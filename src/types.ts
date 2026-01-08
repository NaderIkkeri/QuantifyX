/**
 * Core types for QuantifyX DRM Extension
 */

export interface DatasetMetadata {
  tokenId: string;
  cid: string;
  name: string;
  description?: string;
  owner: string;
  price: string;
  rentalDuration: number;
}

export interface RentalStatus {
  isActive: boolean;
  expiryTimestamp: number;
  renter: string;
  tokenId: string;
}

export interface DecryptedDataset {
  tokenId: string;
  content: Uint8Array;
  filename: string;
  decryptedAt: number;
  expiryTimestamp: number;
}

export interface DjangoDecryptResponse {
  success: boolean;
  decryption_key?: string;
  error?: string;
  rental_status?: {
    is_active: boolean;
    expiry_timestamp: number;
    renter: string;
  };
}

export interface DjangoVerifyResponse {
  success: boolean;
  is_valid: boolean;
  rental_status?: RentalStatus;
  decryption_key?: string;
  ipfs_cid?: string;
  error?: string;
}

export interface UserSession {
  walletAddress: string;
  connectedAt: number;
  isConnected: boolean;
}

export interface WalletAuthResult {
  success: boolean;
  walletAddress?: string;
  signature?: string;
  error?: string;
}

export interface PersistedWalletSession {
  walletAddress: string;
  connectedAt: number;
  lastVerified: number;
  signature?: string;
}

export interface AuthenticationChallenge {
  nonce: string;
  timestamp: number;
  expiresAt: number;
}
