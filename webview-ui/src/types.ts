/**
 * Types for webview UI
 */

export interface MessageToWebview {
  type: 'walletConnected' | 'walletDisconnected' | 'datasetUnlocked' | 'datasetLocked' | 'memoryStats' | 'error';
  payload?: any;
}

export interface MessageFromWebview {
  type: 'walletConnected' | 'disconnectWallet' | 'unlockDataset' | 'lockDataset' | 'getMemoryStats' | 'openDataset' | 'error';
  payload?: any;
}

export interface DatasetInfo {
  tokenId: string;
  filename: string;
  cid?: string;
  name?: string;
  expiresIn: number;
  expiresAt: string;
}

export interface MemoryStats {
  datasetCount: number;
  totalSizeMB: number;
  datasets: Array<{
    tokenId: string;
    filename: string;
    sizeMB: number;
    expiresIn: number;
  }>;
}

export interface WalletInfo {
  address: string;
  connectedAt: number;
  isConnected: boolean;
}
