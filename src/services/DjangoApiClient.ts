/**
 * Django Backend API Client
 * Handles all communication with the Django backend for DRM verification
 */

import * as vscode from 'vscode';
import type { DjangoDecryptResponse, DjangoVerifyResponse, RentalStatus } from '../types';

export class DjangoApiClient {
  private baseUrl: string;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    // Get Django backend URL from VS Code settings (with fallback)
    const config = vscode.workspace.getConfiguration('quantifyx');
    this.baseUrl = config.get('djangoBackendUrl', 'http://localhost:8000');
    this.outputChannel = vscode.window.createOutputChannel('QuantifyX API');
  }

  /**
   * Verify rental status and get decryption key in one call
   * Uses the Django SecureAccessView endpoint which verifies blockchain ownership/rental
   * and returns the encryption key if access is granted
   */
  async verifyRentalStatus(
    tokenId: string,
    walletAddress: string
  ): Promise<DjangoVerifyResponse> {
    try {
      this.log(`Verifying rental status for token ${tokenId}, wallet ${walletAddress}`);

      // Use the SecureAccessView endpoint with dataset_id and wallet_address
      const response = await fetch(
        `${this.baseUrl}/api/datasets/access/${tokenId}/?wallet_address=${encodeURIComponent(walletAddress)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;
      this.log(`Verification response: ${JSON.stringify(data)}`);

      // If successful, we have access and a decryption key
      if (data.success && data.key) {
        return {
          success: true,
          is_valid: true,
          ipfs_cid: data.ipfs_cid,
          decryption_key: data.key,
          error: undefined,
        };
      }

      return {
        success: false,
        is_valid: false,
        error: data.error || 'Access denied',
      };
    } catch (error) {
      this.logError('Rental verification failed', error);
      return {
        success: false,
        is_valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }


  /**
   * Verify access by IPFS CID (for local file opens)
   * This is used when user browses a local encrypted file
   */
  async verifyAccessByCid(
    cid: string,
    walletAddress: string
  ): Promise<DjangoVerifyResponse> {
    try {
      this.log(`Verifying access by CID ${cid}, wallet ${walletAddress}`);

      // Find the dataset by CID and verify access
      // We'll need to fetch all user datasets and find the matching CID
      const response = await fetch(
        `${this.baseUrl}/api/datasets/user-datasets/${walletAddress}/`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;

      // Find dataset with matching CID
      const allDatasets = [
        ...(data.owned || []),
        ...(data.purchased || []),
        ...(data.rented || [])
      ];

      const matchingDataset = allDatasets.find((ds: any) => ds.ipfs_cid === cid);

      if (!matchingDataset) {
        return {
          success: false,
          is_valid: false,
          error: 'No access to this dataset',
        };
      }

      // Now verify and get decryption key using token ID
      return await this.verifyRentalStatus(matchingDataset.token_id.toString(), walletAddress);
    } catch (error) {
      this.logError('Access verification by CID failed', error);
      return {
        success: false,
        is_valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Download encrypted file from IPFS via Django backend
   * The backend fetches from Pinata IPFS gateway and returns the encrypted bytes
   */
  async downloadEncryptedFile(cid: string): Promise<Uint8Array | null> {
    try {
      this.log(`Downloading encrypted file from IPFS: ${cid}`);

      const response = await fetch(`${this.baseUrl}/api/datasets/download-encrypted/${cid}/`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      this.log(`Downloaded ${arrayBuffer.byteLength} bytes`);

      return new Uint8Array(arrayBuffer);
    } catch (error) {
      this.logError('File download failed', error);
      return null;
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  private logError(message: string, error: unknown): void {
    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`[${timestamp}] ERROR: ${message} - ${errorMsg}`);
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }
}
