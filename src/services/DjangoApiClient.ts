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
   * Verify rental status for a specific dataset
   */
  async verifyRentalStatus(
    tokenId: string,
    walletAddress: string
  ): Promise<DjangoVerifyResponse> {
    try {
      this.log(`Verifying rental status for token ${tokenId}, wallet ${walletAddress}`);

      const response = await fetch(`${this.baseUrl}/api/verify-rental/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token_id: tokenId,
          wallet_address: walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.log(`Verification response: ${JSON.stringify(data)}`);

      return {
        success: data.success,
        is_valid: data.is_valid || false,
        rental_status: data.rental_status ? {
          isActive: data.rental_status.is_active,
          expiryTimestamp: data.rental_status.expiry_timestamp,
          renter: data.rental_status.renter,
          tokenId: tokenId,
        } : undefined,
        error: data.error,
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
   * Request decryption key from Django backend
   * Django will verify blockchain status before returning the key
   */
  async requestDecryptionKey(
    tokenId: string,
    walletAddress: string,
    cid: string
  ): Promise<DjangoDecryptResponse> {
    try {
      this.log(`Requesting decryption key for token ${tokenId}`);

      const response = await fetch(`${this.baseUrl}/api/decrypt-dataset/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token_id: tokenId,
          wallet_address: walletAddress,
          cid: cid,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        this.logError('Decryption key request failed', new Error(data.error || 'Unknown error'));
        return {
          success: false,
          error: data.error || 'Failed to obtain decryption key',
        };
      }

      this.log('Decryption key obtained successfully');
      return {
        success: true,
        decryption_key: data.decryption_key,
        rental_status: data.rental_status ? {
          is_active: data.rental_status.is_active,
          expiry_timestamp: data.rental_status.expiry_timestamp,
          renter: data.rental_status.renter,
        } : undefined,
      };
    } catch (error) {
      this.logError('Decryption key request failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Download encrypted file from IPFS via Django backend
   */
  async downloadEncryptedFile(cid: string): Promise<Uint8Array | null> {
    try {
      this.log(`Downloading encrypted file from IPFS: ${cid}`);

      const response = await fetch(`${this.baseUrl}/api/download-encrypted/${cid}/`, {
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
