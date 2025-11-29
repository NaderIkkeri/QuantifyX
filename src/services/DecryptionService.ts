/**
 * Decryption Service
 * Handles in-memory decryption of encrypted datasets using keys from Django
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';

export class DecryptionService {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('QuantifyX Decryption');
  }

  /**
   * Decrypt encrypted dataset using Fernet-compatible decryption
   * This matches the Django backend's encryption scheme (cryptography.fernet.Fernet)
   */
  async decryptDataset(
    encryptedData: Uint8Array,
    decryptionKey: string
  ): Promise<Uint8Array | null> {
    try {
      this.log(`Starting Fernet decryption (encrypted data size: ${encryptedData.length} bytes)`);
      this.log(`Decryption key length: ${decryptionKey.length} chars`);

      // Decode the Fernet token
      const tokenBuffer = Buffer.from(encryptedData);

      // Fernet token format: Version (1 byte) | Timestamp (8 bytes) | IV (16 bytes) | Ciphertext (variable) | HMAC (32 bytes)
      if (tokenBuffer.length < 57) {
        throw new Error('Invalid token: too short');
      }

      const version = tokenBuffer[0];
      if (version !== 0x80) {
        throw new Error('Invalid token version');
      }

      // Extract components
      const timestamp = tokenBuffer.subarray(1, 9);
      const iv = tokenBuffer.subarray(9, 25);
      const ciphertext = tokenBuffer.subarray(25, tokenBuffer.length - 32);
      const hmac = tokenBuffer.subarray(tokenBuffer.length - 32);

      // Decode the base64url-encoded key
      const keyBuffer = this.base64UrlDecode(decryptionKey);

      if (keyBuffer.length !== 32) {
        throw new Error('Invalid key length');
      }

      // Derive signing and encryption keys
      const signingKey = keyBuffer.subarray(0, 16);
      const encryptionKey = keyBuffer.subarray(16, 32);

      // Verify HMAC
      const dataToVerify = tokenBuffer.subarray(0, tokenBuffer.length - 32);
      const computedHmac = crypto
        .createHmac('sha256', signingKey)
        .update(dataToVerify)
        .digest();

      if (!crypto.timingSafeEqual(hmac, computedHmac)) {
        throw new Error('HMAC verification failed');
      }

      // Decrypt using AES-128-CBC
      const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      this.log(`Successfully decrypted ${decrypted.length} bytes`);
      return new Uint8Array(decrypted);
    } catch (error) {
      this.logError('Decryption failed', error);
      return null;
    }
  }

  /**
   * Decrypt using a simpler AES-256-CBC approach (alternative if Fernet doesn't match)
   */
  async decryptSimple(
    encryptedData: Uint8Array,
    decryptionKey: string
  ): Promise<Uint8Array | null> {
    try {
      this.log('Using simple AES-256-CBC decryption');

      // The key might be base64 encoded
      let keyBuffer: Buffer;
      try {
        keyBuffer = Buffer.from(decryptionKey, 'base64');
      } catch {
        keyBuffer = Buffer.from(decryptionKey, 'utf-8');
      }

      // Hash the key to get exactly 32 bytes for AES-256
      const hashedKey = crypto.createHash('sha256').update(keyBuffer).digest();

      // Extract IV (first 16 bytes) and ciphertext (rest)
      const iv = Buffer.from(encryptedData.subarray(0, 16));
      const ciphertext = Buffer.from(encryptedData.subarray(16));

      // Decrypt
      const decipher = crypto.createDecipheriv('aes-256-cbc', hashedKey, iv);
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      this.log(`Successfully decrypted ${decrypted.length} bytes (simple mode)`);
      return new Uint8Array(decrypted);
    } catch (error) {
      this.logError('Simple decryption failed', error);
      return null;
    }
  }

  /**
   * Attempt decryption with automatic fallback
   */
  async decrypt(
    encryptedData: Uint8Array,
    decryptionKey: string
  ): Promise<Uint8Array | null> {
    // Try Fernet-compatible decryption first
    let result = await this.decryptDataset(encryptedData, decryptionKey);

    if (!result) {
      this.log('Fernet decryption failed, trying simple AES decryption');
      result = await this.decryptSimple(encryptedData, decryptionKey);
    }

    return result;
  }

  /**
   * Base64URL decode (Fernet uses base64url encoding)
   */
  private base64UrlDecode(str: string): Buffer {
    // Replace URL-safe characters
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    return Buffer.from(base64, 'base64');
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
