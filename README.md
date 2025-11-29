# QuantifyX VS Code Extension

**Secure Data Analysis Platform with DRM Protection**

A VS Code extension that enables data scientists to work with blockchain-protected datasets through a secure, in-memory DRM system. Datasets are decrypted only after blockchain rental verification and stored entirely in RAM - never written to disk.

## Features

- **Blockchain-Based Access Control**: Verifies dataset rentals through smart contracts on Ethereum (Sepolia testnet)
- **In-Memory DRM**: Decrypted datasets are stored only in RAM, providing true DRM protection
- **Virtual File System**: Access datasets through VS Code's native file system without disk writes
- **Encrypted Storage**: Datasets encrypted with Fernet-compatible encryption on IPFS
- **Time-Based Rentals**: Automatic expiry based on blockchain rental periods
- **Real-Time Monitoring**: Status bar showing active datasets and memory usage

## Architecture

### The Secure Pipeline

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Provider  │ ---> │    IPFS      │ ---> │   Django    │
│   Uploads   │      │  (Encrypted) │      │   Backend   │
└─────────────┘      └──────────────┘      └─────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  Smart Contract │
                                          │    (Sepolia)    │
                                          └─────────────────┘
                                                   │
                                                   ▼
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│    User     │ <--- │  VS Code     │ <--- │   Django    │
│  Opens Data │      │  Extension   │      │  Verification│
└─────────────┘      └──────────────┘      └─────────────┘
```

### How It Works

1. **Upload Phase** (Provider):
   - Django encrypts dataset with unique key
   - Encrypted file uploaded to IPFS
   - NFT minted with IPFS CID
   - Encryption key stored in Django database

2. **Access Phase** (Renter):
   - User connects wallet in VS Code
   - Requests dataset unlock (Token ID + CID)
   - VS Code queries Django backend
   - Django verifies blockchain rental status
   - If valid, Django returns decryption key
   - VS Code downloads encrypted file from IPFS
   - Decrypts in-memory
   - Provides virtual file access (no disk writes)
   - Dataset locked when rental expires

## Installation

### Prerequisites

1. Node.js 20.x or higher
2. VS Code 1.106.1 or higher
3. Django backend running (see backend setup)

### Build the Extension

```bash
# Install dependencies
npm install
cd webview-ui && npm install && cd ..

# Build the webview UI
npm run build:webview

# Compile TypeScript
npm run compile

# Package the extension (optional)
vsce package
```

### Install in VS Code

1. Press `F5` to run in Extension Development Host
2. Or install the `.vsix` package:
   - `Ctrl+Shift+P` → "Extensions: Install from VSIX"

## Usage

### 1. Configure Django Backend

```
Ctrl+Shift+P → "QuantifyX: Configure Django Backend URL"
```

Enter your Django backend URL (default: `http://localhost:8000`)

### 2. Connect Wallet

**Option A: Via Sidebar**
- Click the QuantifyX icon in the Activity Bar
- Click "Connect Wallet"
- Enter your Ethereum address (0x...)

**Option B: Via Command Palette**
```
Ctrl+Shift+P → "QuantifyX: Connect Wallet"
```

### 3. Unlock a Dataset

**Via Sidebar:**
1. Enter Token ID (e.g., `1`)
2. Enter IPFS CID (e.g., `QmXxx...`)
3. Click "Unlock & Open Dataset"

**Via Command Palette:**
```
Ctrl+Shift+P → "QuantifyX: Unlock Dataset"
```

The extension will:
- Verify your rental status on the blockchain
- Download the encrypted file from IPFS
- Decrypt using the key from Django
- Store in RAM
- Open in VS Code editor

### 4. Work with Datasets

Unlocked datasets appear as normal files in VS Code:
- Read and analyze data
- Use with Python, R, or any language
- Full VS Code editor features
- **Cannot save changes** (read-only DRM)

### 5. Monitor Active Datasets

**Status Bar:**
Shows active dataset count and memory usage (bottom right)

**Memory Stats:**
```
Ctrl+Shift+P → "QuantifyX: Show Memory Statistics"
```

### 6. Lock/Clear Datasets

**Lock Single Dataset:**
```
Ctrl+Shift+P → "QuantifyX: Lock Dataset"
```

**Clear All:**
```
Ctrl+Shift+P → "QuantifyX: Clear All Datasets from Memory"
```

## Commands

| Command | Description |
|---------|-------------|
| `QuantifyX: Connect Wallet` | Connect your Ethereum wallet |
| `QuantifyX: Unlock Dataset` | Unlock and open a dataset |
| `QuantifyX: Open Dataset` | Open an already-unlocked dataset |
| `QuantifyX: Lock Dataset` | Remove a dataset from memory |
| `QuantifyX: Clear All Datasets` | Remove all datasets from memory |
| `QuantifyX: Show Memory Statistics` | View memory usage details |
| `QuantifyX: Configure Django Backend URL` | Set backend URL |

## Configuration

Settings available in `settings.json`:

```json
{
  "quantifyx.djangoBackendUrl": "http://localhost:8000",
  "quantifyx.autoConnectWallet": false,
  "quantifyx.memoryLimitMB": 1024
}
```

## Django Backend Setup

Your Django backend must expose these endpoints:

### 1. Verify Rental Status
```
POST /api/verify-rental/
{
  "token_id": "1",
  "wallet_address": "0x..."
}
```

Response:
```json
{
  "success": true,
  "is_valid": true,
  "rental_status": {
    "is_active": true,
    "expiry_timestamp": 1234567890000,
    "renter": "0x..."
  }
}
```

### 2. Request Decryption Key
```
POST /api/decrypt-dataset/
{
  "token_id": "1",
  "wallet_address": "0x...",
  "cid": "QmXxx..."
}
```

Response:
```json
{
  "success": true,
  "decryption_key": "base64_encoded_key",
  "rental_status": {
    "is_active": true,
    "expiry_timestamp": 1234567890000,
    "renter": "0x..."
  }
}
```

### 3. Download Encrypted File
```
GET /api/download-encrypted/{cid}/
```

Returns: Raw encrypted file bytes

## Security Features

### DRM Protection
- **No Disk Writes**: Decrypted data never touches the file system
- **RAM-Only Storage**: All decrypted datasets stored exclusively in memory
- **Read-Only Access**: Virtual file system prevents modifications
- **Time Bombs**: Datasets auto-expire based on blockchain rentals
- **Blockchain Verification**: Every access verified against smart contract

### Encryption
- **Fernet-Compatible**: Django uses Python `cryptography.fernet`
- **Unique Keys**: Each dataset has a unique encryption key
- **Secure Key Storage**: Keys never leave Django backend
- **HMAC Verification**: Prevents tampering with encrypted files

### Access Control
- **Wallet-Based Auth**: Ethereum address as identity
- **Smart Contract Verification**: On-chain rental validation
- **Expiry Enforcement**: Automatic cleanup of expired rentals

## Development

### Project Structure

```
quantifyx/
├── src/
│   ├── extension.ts              # Main extension entry point
│   ├── SidebarProvider.ts        # Webview sidebar handler
│   ├── types.ts                  # TypeScript type definitions
│   ├── controllers/
│   │   └── DatasetController.ts  # Main orchestration logic
│   ├── services/
│   │   ├── DjangoApiClient.ts    # Django backend communication
│   │   ├── DecryptionService.ts  # Fernet-compatible decryption
│   │   └── InMemoryDatasetManager.ts  # RAM-based storage
│   └── providers/
│       └── DatasetFileSystemProvider.ts  # Virtual FS
├── webview-ui/                   # React-based sidebar UI
│   ├── src/
│   │   ├── App.tsx              # Main React component
│   │   ├── App.css              # VS Code-themed styles
│   │   └── types.ts             # Webview types
│   └── build/                    # Built assets
└── package.json                  # Extension manifest
```

### Run in Development

```bash
# Terminal 1: Watch TypeScript compilation
npm run watch

# Terminal 2: Watch webview UI (optional)
npm run dev:webview

# Terminal 3: Press F5 in VS Code to launch Extension Development Host
```

### Build for Production

```bash
npm run vscode:prepublish
```

## Troubleshooting

### Dataset Won't Unlock

1. **Check wallet connection**: Ensure wallet address is correct
2. **Verify rental**: Check blockchain for active rental
3. **Backend connection**: Ensure Django URL is correct
4. **IPFS availability**: Verify CID is accessible

### Decryption Fails

1. **Key mismatch**: Ensure token ID matches the CID
2. **Encryption format**: Verify Django uses Fernet encryption
3. **Corrupted file**: Try re-downloading from IPFS

### Memory Issues

1. **Clear datasets**: Use "Clear All Datasets" command
2. **Adjust limit**: Increase `quantifyx.memoryLimitMB` setting
3. **Restart VS Code**: Force garbage collection

## API Reference

See inline TypeScript documentation in source files:
- [src/types.ts](src/types.ts) - Core type definitions
- [src/services/DjangoApiClient.ts](src/services/DjangoApiClient.ts) - API client
- [src/controllers/DatasetController.ts](src/controllers/DatasetController.ts) - Main controller

## License

MIT License - See LICENSE file

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

For issues or questions:
1. Check existing issues on GitHub
2. Create a new issue with detailed information
3. Include VS Code version, extension version, and logs

## Roadmap

- [ ] MetaMask integration for wallet connection
- [ ] Support for multiple encryption formats
- [ ] Dataset preview in sidebar
- [ ] Collaborative features for team access
- [ ] Support for Python Jupyter notebooks
- [ ] Advanced analytics on dataset usage
