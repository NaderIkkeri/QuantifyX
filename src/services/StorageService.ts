import * as vscode from 'vscode';
import type { PersistedWalletSession } from '../types';

/**
 * StorageService manages persistent wallet session storage using VS Code APIs.
 *
 * Storage Strategy:
 * - globalState: Store wallet address and timestamps (non-sensitive data)
 * - secrets: Store signature for re-verification (optional, sensitive data)
 *
 * Session Validation:
 * - Sessions expire after configurable timeout (default: 30 days)
 * - Automatic cleanup of expired sessions
 */
export class StorageService {
  private static readonly WALLET_ADDRESS_KEY = 'quantifyx.walletAddress';
  private static readonly CONNECTED_AT_KEY = 'quantifyx.connectedAt';
  private static readonly LAST_VERIFIED_KEY = 'quantifyx.lastVerified';
  private static readonly SIGNATURE_KEY = 'quantifyx.signature';

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Save wallet session to persistent storage
   */
  async saveWalletSession(session: PersistedWalletSession): Promise<void> {
    try {
      await this.context.globalState.update(
        StorageService.WALLET_ADDRESS_KEY,
        session.walletAddress
      );

      await this.context.globalState.update(
        StorageService.CONNECTED_AT_KEY,
        session.connectedAt
      );

      await this.context.globalState.update(
        StorageService.LAST_VERIFIED_KEY,
        session.lastVerified
      );

      if (session.signature) {
        await this.context.secrets.store(
          StorageService.SIGNATURE_KEY,
          session.signature
        );
      }

      console.log('[StorageService] Wallet session saved successfully');
    } catch (error) {
      console.error('[StorageService] Failed to save wallet session:', error);
      throw new Error('Failed to save wallet session to storage');
    }
  }

  /**
   * Load wallet session from persistent storage
   */
  async loadWalletSession(): Promise<PersistedWalletSession | null> {
    try {
      const walletAddress = this.context.globalState.get<string>(
        StorageService.WALLET_ADDRESS_KEY
      );

      if (!walletAddress) {
        console.log('[StorageService] No stored wallet session found');
        return null;
      }

      const connectedAt = this.context.globalState.get<number>(
        StorageService.CONNECTED_AT_KEY,
        0
      );

      const lastVerified = this.context.globalState.get<number>(
        StorageService.LAST_VERIFIED_KEY,
        0
      );

      const signature = await this.context.secrets.get(
        StorageService.SIGNATURE_KEY
      );

      const session: PersistedWalletSession = {
        walletAddress,
        connectedAt,
        lastVerified,
        signature: signature || undefined
      };

      console.log('[StorageService] Wallet session loaded successfully');
      return session;
    } catch (error) {
      console.error('[StorageService] Failed to load wallet session:', error);
      return null;
    }
  }

  /**
   * Clear wallet session from persistent storage
   */
  async clearWalletSession(): Promise<void> {
    try {
      await this.context.globalState.update(
        StorageService.WALLET_ADDRESS_KEY,
        undefined
      );

      await this.context.globalState.update(
        StorageService.CONNECTED_AT_KEY,
        undefined
      );

      await this.context.globalState.update(
        StorageService.LAST_VERIFIED_KEY,
        undefined
      );

      await this.context.secrets.delete(StorageService.SIGNATURE_KEY);

      console.log('[StorageService] Wallet session cleared successfully');
    } catch (error) {
      console.error('[StorageService] Failed to clear wallet session:', error);
      throw new Error('Failed to clear wallet session from storage');
    }
  }

  /**
   * Check if the stored session is still valid
   */
  async isSessionValid(): Promise<boolean> {
    try {
      const session = await this.loadWalletSession();

      if (!session) {
        return false;
      }

      const sessionTimeout = this.getSessionTimeoutMs();
      const age = Date.now() - session.lastVerified;

      if (age > sessionTimeout) {
        console.log('[StorageService] Session expired, clearing storage');
        await this.clearWalletSession();
        return false;
      }

      return true;
    } catch (error) {
      console.error('[StorageService] Error validating session:', error);
      return false;
    }
  }

  /**
   * Get session timeout in milliseconds from configuration
   */
  private getSessionTimeoutMs(): number {
    const config = vscode.workspace.getConfiguration('quantifyx');
    const timeoutDays = config.get<number>('walletSessionTimeout', 30);
    return timeoutDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Update last verified timestamp for the current session
   */
  async updateLastVerified(): Promise<void> {
    try {
      await this.context.globalState.update(
        StorageService.LAST_VERIFIED_KEY,
        Date.now()
      );
      console.log('[StorageService] Last verified timestamp updated');
    } catch (error) {
      console.error('[StorageService] Failed to update last verified:', error);
    }
  }
}
