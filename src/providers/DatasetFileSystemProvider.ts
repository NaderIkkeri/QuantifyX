/**
 * Virtual File System Provider for In-Memory Datasets
 * Allows VS Code to read decrypted datasets from RAM without writing to disk
 */

import * as vscode from 'vscode';
import { InMemoryDatasetManager } from '../services/InMemoryDatasetManager';

export class DatasetFileSystemProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  constructor(private datasetManager: InMemoryDatasetManager) {}

  /**
   * Watch for file changes (not implemented for in-memory files)
   */
  watch(_uri: vscode.Uri): vscode.Disposable {
    // No-op for in-memory files
    return new vscode.Disposable(() => {});
  }

  /**
   * Get file/directory statistics
   */
  stat(uri: vscode.Uri): vscode.FileStat {
    const tokenId = this.extractTokenId(uri);

    if (!tokenId) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const datasetInfo = this.datasetManager.getDatasetInfo(tokenId);

    if (!datasetInfo) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const content = this.datasetManager.getDatasetContent(tokenId);
    const size = content ? content.length : 0;

    return {
      type: vscode.FileType.File,
      ctime: datasetInfo.decryptedAt,
      mtime: datasetInfo.decryptedAt,
      size: size,
    };
  }

  /**
   * Read directory (not implemented - we only serve individual files)
   */
  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }

  /**
   * Create directory (not allowed)
   */
  createDirectory(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions('Cannot create directories in dataset storage');
  }

  /**
   * Read file content from memory
   */
  readFile(uri: vscode.Uri): Uint8Array {
    const tokenId = this.extractTokenId(uri);

    if (!tokenId) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const content = this.datasetManager.getDatasetContent(tokenId);

    if (!content) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return content;
  }

  /**
   * Write file (not allowed - DRM protection)
   */
  writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean }): void {
    throw vscode.FileSystemError.NoPermissions('Cannot write to dataset storage - datasets are read-only');
  }

  /**
   * Delete file (not allowed - use explicit unlock/clear commands)
   */
  delete(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions('Cannot delete datasets directly - use extension commands');
  }

  /**
   * Rename file (not allowed)
   */
  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
    throw vscode.FileSystemError.NoPermissions('Cannot rename datasets');
  }

  /**
   * Extract token ID from URI path
   * Expected format: quantifyx://<tokenId>/<filename>
   */
  private extractTokenId(uri: vscode.Uri): string | null {
    return uri.authority || null;
  }

  /**
   * Create a URI for a dataset
   */
  static createUri(tokenId: string, filename: string): vscode.Uri {
    return vscode.Uri.parse(`quantifyx://${tokenId}/${filename}`);
  }

  /**
   * Notify VS Code that a file has changed
   */
  notifyFileChanged(tokenId: string, filename: string): void {
    const uri = DatasetFileSystemProvider.createUri(tokenId, filename);
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  /**
   * Notify VS Code that a file has been created
   */
  notifyFileCreated(tokenId: string, filename: string): void {
    const uri = DatasetFileSystemProvider.createUri(tokenId, filename);
    this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
  }

  /**
   * Notify VS Code that a file has been deleted
   */
  notifyFileDeleted(tokenId: string, filename: string): void {
    const uri = DatasetFileSystemProvider.createUri(tokenId, filename);
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }
}
