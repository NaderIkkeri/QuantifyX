/**
 * In-Memory Dataset Manager
 * Stores decrypted datasets in RAM only - never writes to disk (DRM protection)
 */

import * as vscode from 'vscode';
import type { DecryptedDataset } from '../types';

export class InMemoryDatasetManager {
  private datasets: Map<string, DecryptedDataset> = new Map();
  private outputChannel: vscode.OutputChannel;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('QuantifyX Storage');

    // Periodic cleanup of expired datasets (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredDatasets();
    }, 5 * 60 * 1000);
  }

  /**
   * Store decrypted dataset in memory
   */
  storeDataset(dataset: DecryptedDataset): void {
    this.log(`Storing dataset ${dataset.tokenId} (${dataset.filename}) in memory`);
    this.datasets.set(dataset.tokenId, dataset);

    // Show memory usage
    const totalSize = Array.from(this.datasets.values())
      .reduce((sum, ds) => sum + ds.content.length, 0);
    this.log(`Total in-memory datasets: ${this.datasets.size}, Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  }

  /**
   * Retrieve dataset from memory
   */
  getDataset(tokenId: string): DecryptedDataset | null {
    const dataset = this.datasets.get(tokenId);

    if (!dataset) {
      this.log(`Dataset ${tokenId} not found in memory`);
      return null;
    }

    // Check if expired
    if (this.isExpired(dataset)) {
      this.log(`Dataset ${tokenId} has expired, removing from memory`);
      this.removeDataset(tokenId);
      return null;
    }

    return dataset;
  }

  /**
   * Get dataset content by token ID
   */
  getDatasetContent(tokenId: string): Uint8Array | null {
    const dataset = this.getDataset(tokenId);
    return dataset ? dataset.content : null;
  }

  /**
   * Check if dataset exists and is valid
   */
  hasDataset(tokenId: string): boolean {
    const dataset = this.datasets.get(tokenId);
    if (!dataset) {
      return false;
    }
    return !this.isExpired(dataset);
  }

  /**
   * Remove dataset from memory
   */
  removeDataset(tokenId: string): boolean {
    const existed = this.datasets.delete(tokenId);
    if (existed) {
      this.log(`Removed dataset ${tokenId} from memory`);

      // Force garbage collection hint (if available)
      if (typeof (global as any).gc === 'function') {
        (global as any).gc();
      }
    }
    return existed;
  }

  /**
   * Remove all datasets
   */
  clearAll(): void {
    const count = this.datasets.size;
    this.datasets.clear();
    this.log(`Cleared all ${count} datasets from memory`);

    // Force garbage collection hint (if available)
    if (typeof (global as any).gc === 'function') {
      (global as any).gc();
    }
  }

  /**
   * Get all active datasets
   */
  getAllDatasets(): DecryptedDataset[] {
    const now = Date.now();
    return Array.from(this.datasets.values())
      .filter(ds => ds.expiryTimestamp > now);
  }

  /**
   * Get dataset metadata (without content)
   */
  getDatasetInfo(tokenId: string): Omit<DecryptedDataset, 'content'> | null {
    const dataset = this.getDataset(tokenId);
    if (!dataset) {
      return null;
    }

    return {
      tokenId: dataset.tokenId,
      filename: dataset.filename,
      decryptedAt: dataset.decryptedAt,
      expiryTimestamp: dataset.expiryTimestamp,
    };
  }

  /**
   * Check if dataset is expired
   */
  private isExpired(dataset: DecryptedDataset): boolean {
    return Date.now() > dataset.expiryTimestamp;
  }

  /**
   * Cleanup expired datasets
   */
  private cleanupExpiredDatasets(): void {
    const now = Date.now();
    let removedCount = 0;

    // Convert to array to avoid iterator issues
    const entries = Array.from(this.datasets.entries());
    for (const [tokenId, dataset] of entries) {
      if (dataset.expiryTimestamp < now) {
        this.datasets.delete(tokenId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.log(`Cleaned up ${removedCount} expired dataset(s)`);
      // Force garbage collection hint (if available)
      if (typeof (global as any).gc === 'function') {
        (global as any).gc();
      }
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    datasetCount: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    datasets: Array<{ tokenId: string; filename: string; sizeMB: number; expiresIn: number }>;
  } {
    const now = Date.now();
    const datasets = Array.from(this.datasets.values());
    const totalSizeBytes = datasets.reduce((sum, ds) => sum + ds.content.length, 0);

    return {
      datasetCount: datasets.length,
      totalSizeBytes,
      totalSizeMB: totalSizeBytes / 1024 / 1024,
      datasets: datasets.map(ds => ({
        tokenId: ds.tokenId,
        filename: ds.filename,
        sizeMB: ds.content.length / 1024 / 1024,
        expiresIn: Math.max(0, ds.expiryTimestamp - now),
      })),
    };
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  public dispose(): void {
    clearInterval(this.cleanupInterval);
    this.clearAll();
    this.outputChannel.dispose();
  }
}
