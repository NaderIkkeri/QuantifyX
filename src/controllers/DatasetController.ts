/**
 * Dataset Controller
 * Orchestrates the complete workflow: download -> verify -> decrypt -> store
 */

import * as vscode from 'vscode';
import { DjangoApiClient } from '../services/DjangoApiClient';
import { DecryptionService } from '../services/DecryptionService';
import { InMemoryDatasetManager } from '../services/InMemoryDatasetManager';
import { DatasetFileSystemProvider } from '../providers/DatasetFileSystemProvider';
import type { DecryptedDataset, UserSession } from '../types';

export class DatasetController {
  private apiClient: DjangoApiClient;
  private decryptionService: DecryptionService;
  private datasetManager: InMemoryDatasetManager;
  private fsProvider: DatasetFileSystemProvider;
  private currentSession: UserSession | null = null;

  constructor(
    apiClient: DjangoApiClient,
    decryptionService: DecryptionService,
    datasetManager: InMemoryDatasetManager,
    fsProvider: DatasetFileSystemProvider
  ) {
    this.apiClient = apiClient;
    this.decryptionService = decryptionService;
    this.datasetManager = datasetManager;
    this.fsProvider = fsProvider;
  }

  /**
   * Set current user session (wallet connection)
   */
  setUserSession(session: UserSession): void {
    this.currentSession = session;
  }

  /**
   * Get current user session
   */
  getUserSession(): UserSession | null {
    return this.currentSession;
  }

  /**
   * Main workflow: Unlock and open a dataset
   */
  async unlockDataset(tokenId: string, cid: string, filename?: string): Promise<boolean> {
    if (!this.currentSession || !this.currentSession.isConnected) {
      vscode.window.showErrorMessage('Please connect your wallet first');
      return false;
    }

    try {
      // Show progress
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Unlocking dataset ${tokenId}`,
          cancellable: false,
        },
        async (progress) => {
          // Step 1: Check if already in memory
          if (this.datasetManager.hasDataset(tokenId)) {
            progress.report({ message: 'Dataset already unlocked, opening...' });
            return await this.openDataset(tokenId);
          }

          // Step 2: Verify rental status
          progress.report({ message: 'Verifying rental status on blockchain...' });
          const verifyResponse = await this.apiClient.verifyRentalStatus(
            tokenId,
            this.currentSession!.walletAddress
          );

          if (!verifyResponse.success || !verifyResponse.is_valid) {
            vscode.window.showErrorMessage(
              `Access denied: ${verifyResponse.error || 'Rental not active or expired'}`
            );
            return false;
          }

          // Step 3: Request decryption key
          progress.report({ message: 'Requesting decryption key...' });
          const decryptResponse = await this.apiClient.requestDecryptionKey(
            tokenId,
            this.currentSession!.walletAddress,
            cid
          );

          if (!decryptResponse.success || !decryptResponse.decryption_key) {
            vscode.window.showErrorMessage(
              `Failed to obtain decryption key: ${decryptResponse.error || 'Unknown error'}`
            );
            return false;
          }

          // Step 4: Download encrypted file
          progress.report({ message: 'Downloading encrypted dataset from IPFS...' });
          const encryptedData = await this.apiClient.downloadEncryptedFile(cid);

          if (!encryptedData) {
            vscode.window.showErrorMessage('Failed to download encrypted dataset');
            return false;
          }

          // Step 5: Decrypt
          progress.report({ message: 'Decrypting dataset...' });
          const decryptedData = await this.decryptionService.decrypt(
            encryptedData,
            decryptResponse.decryption_key
          );

          if (!decryptedData) {
            vscode.window.showErrorMessage('Failed to decrypt dataset');
            return false;
          }

          // Step 6: Store in memory
          progress.report({ message: 'Storing in memory...' });
          const datasetFilename = filename || this.generateFilename(tokenId, cid);

          const dataset: DecryptedDataset = {
            tokenId,
            content: decryptedData,
            filename: datasetFilename,
            decryptedAt: Date.now(),
            expiryTimestamp: decryptResponse.rental_status?.expiry_timestamp || Date.now() + 7 * 24 * 60 * 60 * 1000,
          };

          this.datasetManager.storeDataset(dataset);
          this.fsProvider.notifyFileCreated(tokenId, datasetFilename);

          // Step 7: Open in editor
          progress.report({ message: 'Opening dataset...' });
          await this.openDataset(tokenId);

          vscode.window.showInformationMessage(
            `Dataset ${tokenId} unlocked successfully! Access expires: ${new Date(dataset.expiryTimestamp).toLocaleString()}`
          );

          return true;
        }
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to unlock dataset: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Open dataset in VS Code editor
   */
  async openDataset(tokenId: string): Promise<boolean> {
    const datasetInfo = this.datasetManager.getDatasetInfo(tokenId);

    if (!datasetInfo) {
      vscode.window.showErrorMessage(`Dataset ${tokenId} not found or expired`);
      return false;
    }

    try {
      const uri = DatasetFileSystemProvider.createUri(tokenId, datasetInfo.filename);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to open dataset: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Lock (remove) dataset from memory
   */
  async lockDataset(tokenId: string): Promise<boolean> {
    const datasetInfo = this.datasetManager.getDatasetInfo(tokenId);

    if (!datasetInfo) {
      vscode.window.showWarningMessage(`Dataset ${tokenId} not found in memory`);
      return false;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove dataset "${datasetInfo.filename}" from memory?`,
      { modal: true },
      'Remove'
    );

    if (confirm !== 'Remove') {
      return false;
    }

    this.datasetManager.removeDataset(tokenId);
    this.fsProvider.notifyFileDeleted(tokenId, datasetInfo.filename);

    vscode.window.showInformationMessage(`Dataset ${tokenId} removed from memory`);
    return true;
  }

  /**
   * Get all active datasets
   */
  getActiveDatasets(): Array<{ tokenId: string; filename: string; expiresIn: number }> {
    const datasets = this.datasetManager.getAllDatasets();
    const now = Date.now();

    return datasets.map(ds => ({
      tokenId: ds.tokenId,
      filename: ds.filename,
      expiresIn: Math.max(0, ds.expiryTimestamp - now),
    }));
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return this.datasetManager.getMemoryStats();
  }

  /**
   * Clear all datasets
   */
  async clearAllDatasets(): Promise<void> {
    const stats = this.datasetManager.getMemoryStats();

    if (stats.datasetCount === 0) {
      vscode.window.showInformationMessage('No datasets in memory');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove all ${stats.datasetCount} dataset(s) from memory?`,
      { modal: true },
      'Remove All'
    );

    if (confirm !== 'Remove All') {
      return;
    }

    this.datasetManager.clearAll();
    vscode.window.showInformationMessage('All datasets removed from memory');
  }

  /**
   * Generate filename from token ID and CID
   */
  private generateFilename(tokenId: string, cid: string): string {
    return `dataset_${tokenId}_${cid.substring(0, 8)}.csv`;
  }
}
