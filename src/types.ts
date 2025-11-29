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
  error?: string;
}

export interface UserSession {
  walletAddress: string;
  connectedAt: number;
  isConnected: boolean;
}
