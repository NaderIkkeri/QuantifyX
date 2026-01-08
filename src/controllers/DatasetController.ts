/**
 * Dataset Controller
 * Orchestrates the complete workflow: download -> verify -> decrypt -> store
 */

import * as vscode from 'vscode';
import { DjangoApiClient } from '../services/DjangoApiClient';
import { DecryptionService } from '../services/DecryptionService';
import { InMemoryDatasetManager } from '../services/InMemoryDatasetManager';
import { DatasetFileSystemProvider } from '../providers/DatasetFileSystemProvider';
import { StorageService } from '../services/StorageService';
import type { DecryptedDataset, UserSession, PersistedWalletSession } from '../types';

export class DatasetController {
  private apiClient: DjangoApiClient;
  private decryptionService: DecryptionService;
  private datasetManager: InMemoryDatasetManager;
  private fsProvider: DatasetFileSystemProvider;
  private storageService: StorageService;
  private currentSession: UserSession | null = null;

  constructor(
    apiClient: DjangoApiClient,
    decryptionService: DecryptionService,
    datasetManager: InMemoryDatasetManager,
    fsProvider: DatasetFileSystemProvider,
    storageService: StorageService
  ) {
    this.apiClient = apiClient;
    this.decryptionService = decryptionService;
    this.datasetManager = datasetManager;
    this.fsProvider = fsProvider;
    this.storageService = storageService;
  }

  /**
   * Set current user session (wallet connection)
   */
  async setUserSession(session: UserSession): Promise<void> {
    this.currentSession = session;

    if (session.isConnected) {
      await this.persistSession(session);
    } else {
      await this.clearPersistedSession();
    }
  }

  /**
   * Persist wallet session to storage
   */
  async persistSession(session: UserSession): Promise<void> {
    const persistedSession: PersistedWalletSession = {
      walletAddress: session.walletAddress,
      connectedAt: session.connectedAt,
      lastVerified: Date.now()
    };

    await this.storageService.saveWalletSession(persistedSession);
  }

  /**
   * Load persisted wallet session from storage
   */
  async loadPersistedSession(): Promise<UserSession | null> {
    const isValid = await this.storageService.isSessionValid();

    if (!isValid) {
      return null;
    }

    const persistedSession = await this.storageService.loadWalletSession();

    if (!persistedSession) {
      return null;
    }

    return {
      walletAddress: persistedSession.walletAddress,
      connectedAt: persistedSession.connectedAt,
      isConnected: true
    };
  }

  /**
   * Clear persisted wallet session from storage
   */
  async clearPersistedSession(): Promise<void> {
    await this.storageService.clearWalletSession();
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

          // Step 2: Verify rental status and get decryption key
          progress.report({ message: 'Verifying blockchain access and retrieving key...' });
          const verifyResponse = await this.apiClient.verifyRentalStatus(
            tokenId,
            this.currentSession!.walletAddress
          );

          if (!verifyResponse.success || !verifyResponse.is_valid || !verifyResponse.decryption_key) {
            vscode.window.showErrorMessage(
              `Access denied: ${verifyResponse.error || 'Rental not active or expired'}`
            );
            return false;
          }

          // Get the IPFS CID from the response (or use the provided one)
          const actualCid = verifyResponse.ipfs_cid || cid;

          // Step 3: Download encrypted file from IPFS
          progress.report({ message: 'Downloading encrypted dataset from IPFS...' });
          const encryptedData = await this.apiClient.downloadEncryptedFile(actualCid);

          if (!encryptedData) {
            vscode.window.showErrorMessage('Failed to download encrypted dataset');
            return false;
          }

          // Step 4: Decrypt
          progress.report({ message: 'Decrypting dataset...' });
          const decryptedData = await this.decryptionService.decrypt(
            encryptedData,
            verifyResponse.decryption_key
          );

          if (!decryptedData) {
            vscode.window.showErrorMessage('Failed to decrypt dataset');
            return false;
          }

          // Step 5: Store in memory
          progress.report({ message: 'Storing in memory...' });
          const datasetFilename = filename || this.generateFilename(tokenId, actualCid);

          const dataset: DecryptedDataset = {
            tokenId,
            content: decryptedData,
            filename: datasetFilename,
            decryptedAt: Date.now(),
            expiryTimestamp: verifyResponse.rental_status?.expiryTimestamp || Date.now() + 7 * 24 * 60 * 60 * 1000,
          };

          this.datasetManager.storeDataset(dataset);
          this.fsProvider.notifyFileCreated(tokenId, datasetFilename);

          // Step 6: Open in editor
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
   * Open a local encrypted file directly
   * Extracts CID from filename, verifies access, and opens
   */
  async openLocalFile(): Promise<boolean> {
    if (!this.currentSession || !this.currentSession.isConnected) {
      vscode.window.showErrorMessage('Please connect your wallet first');
      return false;
    }

    // 1. Open File Picker
    const fileUris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Unlock & Open',
      filters: {
        'Encrypted Datasets': ['enc', 'bin'],
        'All Files': ['*']
      }
    });

    if (!fileUris || fileUris.length === 0) {
      return false;
    }

    const fileUri = fileUris[0];
    const filename = fileUri.path.split('/').pop() || '';

    // 2. Extract CID from filename
    // Matches standard IPFS CID v0 (Qm...) or v1 (b...)
    const cidRegex = /(Qm[a-zA-Z0-9]{44}|b[a-z2-7]{58})/;
    const match = filename.match(cidRegex);

    if (!match) {
      vscode.window.showErrorMessage(
        'Could not detect IPFS CID in filename. Please ensure the file is named like "[CID].enc" or "[CID].bin".'
      );
      return false;
    }

    const cid = match[0];

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Unlocking local file: ${filename}`,
        cancellable: false,
      },
      async (progress) => {
        try {
          // 3. Read file content
          progress.report({ message: 'Reading local file...' });
          const fileContent = await vscode.workspace.fs.readFile(fileUri);

          // 4. Verify Access
          progress.report({ message: 'Verifying access on blockchain...' });
          const verifyResponse = await this.apiClient.verifyAccessByCid(
            cid,
            this.currentSession!.walletAddress
          );

          if (!verifyResponse.success || !verifyResponse.decryption_key) {
            throw new Error(verifyResponse.error || 'Access denied');
          }

          // 5. Decrypt
          progress.report({ message: 'Decrypting...' });
          const decryptedData = await this.decryptionService.decrypt(
            fileContent,
            verifyResponse.decryption_key
          );

          if (!decryptedData) {
            throw new Error('Decryption failed');
          }

          // 6. Store & Open
          // Use a temporary ID since we might not have the Token ID from the filename check alone
          // But verifyResponse might give it to us if we updated the backend to return it.
          // The backend AccessByCIDView DOES return 'token_id' now.
          // Let's assume the API client types might need update or we just cast it.
          // For now, use CID as ID if Token ID is missing, but better to use Token ID.
          // I'll check verifyResponse structure in DjangoApiClient.

          // Actually, verifyResponse in DjangoApiClient returns DjangoVerifyResponse which has ipfs_cid.
          // It doesn't explicitly have token_id in the interface yet.
          // I should probably update the interface, but for now I'll use CID as the ID for memory storage
          // or try to get token_id from the response if I cast it.

          const tokenId = (verifyResponse as any).token_id || `local_${cid.substring(0, 6)}`;

          const dataset: DecryptedDataset = {
            tokenId: tokenId.toString(),
            content: decryptedData,
            filename: filename.replace(/\.(enc|bin)$/, '') + '_decrypted.csv', // Guess extension
            decryptedAt: Date.now(),
            expiryTimestamp: Date.now() + 24 * 60 * 60 * 1000, // 24h default for local open
          };

          this.datasetManager.storeDataset(dataset);
          this.fsProvider.notifyFileCreated(dataset.tokenId, dataset.filename);

          await this.openDataset(dataset.tokenId);

          vscode.window.showInformationMessage('Local file unlocked and opened successfully!');
          return true;

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(`Failed to open local file: ${errorMsg}`);
          return false;
        }
      }
    );
  }
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
   * Auto-fetch all datasets owned or leased by the connected wallet
   * This queries the blockchain to find all datasets the user has access to
   */
  async autoFetchUserDatasets(): Promise<{ owned: any[], purchased: any[], rented: any[] }> {
    if (!this.currentSession || !this.currentSession.isConnected) {
      vscode.window.showWarningMessage('Please connect your wallet first');
      return { owned: [], purchased: [], rented: [] };
    }

    try {
      // Fetch from backend API
      const response = await fetch(
        `${this.apiClient['baseUrl']}/api/datasets/user-datasets/${this.currentSession.walletAddress}/`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch user datasets: ${response.statusText}`);
      }

      const data = await response.json() as { owned?: any[], purchased?: any[], rented?: any[] };
      return {
        owned: data.owned || [],
        purchased: data.purchased || [],
        rented: data.rented || []
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to fetch your datasets: ${errorMsg}`);
      return { owned: [], purchased: [], rented: [] };
    }
  }

  /**
   * Generate filename from token ID and CID
   */
  private generateFilename(tokenId: string, cid: string): string {
    return `dataset_${tokenId}_${cid.substring(0, 8)}.csv`;
  }
}
