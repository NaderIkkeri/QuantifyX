# QuantifyX Extension - Quick Setup Guide

## Development Setup

### 1. Install Dependencies

```bash
# Root extension dependencies
npm install

# Webview UI dependencies
cd webview-ui
npm install
cd ..
```

### 2. Build the Webview

```bash
npm run build:webview
```

This creates the React UI build in `webview-ui/build/`.

### 3. Compile TypeScript

```bash
npm run compile
```

This compiles TypeScript files to `out/` directory.

### 4. Run in Development Mode

Press `F5` in VS Code to launch the Extension Development Host.

Alternatively:
```bash
# Terminal 1: Watch TypeScript
npm run watch

# Terminal 2: Run extension
# Press F5 in VS Code
```

## Django Backend Requirements

Your Django backend needs these three endpoints:

### 1. `/api/verify-rental/` (POST)

Verifies if a wallet has an active rental for a dataset.

**Request:**
```json
{
  "token_id": "1",
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "success": true,
  "is_valid": true,
  "rental_status": {
    "is_active": true,
    "expiry_timestamp": 1704067200000,
    "renter": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }
}
```

### 2. `/api/decrypt-dataset/` (POST)

Returns the decryption key if rental is valid.

**Request:**
```json
{
  "token_id": "1",
  "wallet_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "cid": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
}
```

**Response:**
```json
{
  "success": true,
  "decryption_key": "gAAAAABl1234...",
  "rental_status": {
    "is_active": true,
    "expiry_timestamp": 1704067200000,
    "renter": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }
}
```

### 3. `/api/download-encrypted/<cid>/` (GET)

Returns the encrypted file bytes from IPFS.

**Request:**
```
GET /api/download-encrypted/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/
```

**Response:**
Raw encrypted file bytes.

## Django Example Implementation

Here's a minimal Django view example:

```python
from django.http import JsonResponse, HttpResponse
from rest_framework.decorators import api_view
from cryptography.fernet import Fernet
import requests
from web3 import Web3

@api_view(['POST'])
def verify_rental(request):
    token_id = request.data.get('token_id')
    wallet_address = request.data.get('wallet_address')

    # Check blockchain for active rental
    is_active = check_blockchain_rental(token_id, wallet_address)

    if is_active:
        expiry = get_rental_expiry(token_id, wallet_address)
        return JsonResponse({
            'success': True,
            'is_valid': True,
            'rental_status': {
                'is_active': True,
                'expiry_timestamp': expiry,
                'renter': wallet_address
            }
        })
    else:
        return JsonResponse({
            'success': False,
            'is_valid': False,
            'error': 'No active rental found'
        })

@api_view(['POST'])
def decrypt_dataset(request):
    token_id = request.data.get('token_id')
    wallet_address = request.data.get('wallet_address')
    cid = request.data.get('cid')

    # Verify rental first
    if not check_blockchain_rental(token_id, wallet_address):
        return JsonResponse({
            'success': False,
            'error': 'No active rental'
        })

    # Get encryption key from database
    dataset = Dataset.objects.get(token_id=token_id, cid=cid)

    return JsonResponse({
        'success': True,
        'decryption_key': dataset.encryption_key,
        'rental_status': {
            'is_active': True,
            'expiry_timestamp': get_rental_expiry(token_id, wallet_address),
            'renter': wallet_address
        }
    })

@api_view(['GET'])
def download_encrypted(request, cid):
    # Download from IPFS
    ipfs_url = f'https://gateway.pinata.cloud/ipfs/{cid}'
    response = requests.get(ipfs_url)

    return HttpResponse(response.content, content_type='application/octet-stream')
```

## Testing the Extension

### 1. Configure Backend URL

In the Extension Development Host:
- `Ctrl+Shift+P` → "QuantifyX: Configure Django Backend URL"
- Enter: `http://localhost:8000`

### 2. Connect Wallet

- Click QuantifyX icon in Activity Bar (left sidebar)
- Click "Connect Wallet"
- Enter test wallet address: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`

### 3. Unlock a Dataset

In the sidebar:
- Token ID: `1`
- IPFS CID: `QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG`
- Click "Unlock & Open Dataset"

The extension will:
1. Verify rental with Django
2. Get decryption key
3. Download encrypted file
4. Decrypt in memory
5. Open in editor

## File Structure Reference

```
quantifyx/
├── src/                          # Extension source code
│   ├── extension.ts              # Main entry point
│   ├── SidebarProvider.ts        # React UI handler
│   ├── types.ts                  # TypeScript types
│   ├── controllers/
│   │   └── DatasetController.ts  # Main logic orchestration
│   ├── services/
│   │   ├── DjangoApiClient.ts    # Django API communication
│   │   ├── DecryptionService.ts  # Fernet decryption
│   │   └── InMemoryDatasetManager.ts  # RAM storage
│   └── providers/
│       └── DatasetFileSystemProvider.ts  # Virtual FS
│
├── webview-ui/                   # React frontend
│   ├── src/
│   │   ├── App.tsx              # Main UI component
│   │   ├── App.css              # Styles
│   │   └── types.ts             # UI types
│   ├── build/                    # Built files (after npm run build)
│   └── vite.config.ts           # Vite config
│
├── out/                          # Compiled TypeScript (after npm run compile)
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── README.md                     # Documentation
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run compile` | Compile TypeScript |
| `npm run watch` | Watch TypeScript changes |
| `npm run build:webview` | Build React UI |
| `npm run dev:webview` | Develop React UI with hot reload |
| `F5` in VS Code | Run extension in debug mode |

## Debugging

### Enable Output Channels

In Extension Development Host:
1. `View` → `Output`
2. Select from dropdown:
   - `QuantifyX API` - Django API calls
   - `QuantifyX Decryption` - Decryption logs
   - `QuantifyX Storage` - Memory management

### Check Extension Logs

- `Ctrl+Shift+P` → "Developer: Show Logs"
- Select "Extension Host"

## Next Steps

1. **Test the workflow**: Try unlocking a dataset end-to-end
2. **Customize UI**: Edit `webview-ui/src/App.tsx`
3. **Add features**: Extend `DatasetController.ts`
4. **Deploy**: Use `vsce package` to create `.vsix`

## Troubleshooting

### "Cannot find module" errors

```bash
npm install
cd webview-ui && npm install
```

### Webview not loading

```bash
cd webview-ui
npm run build
cd ..
npm run compile
```

### Django connection fails

- Check Django is running on the configured URL
- Verify CORS is enabled in Django
- Check Django endpoints match the expected format

### Decryption fails

- Ensure Django uses Fernet encryption (Python `cryptography` library)
- Verify encryption key is base64url encoded
- Check encrypted file format matches Fernet token structure

## Production Deployment

### 1. Build for production

```bash
npm run vscode:prepublish
```

### 2. Package extension

```bash
npm install -g @vscode/vsce
vsce package
```

This creates `quantifyx-0.0.1.vsix`.

### 3. Publish to marketplace (optional)

```bash
vsce publish
```

Or install manually:
- `Ctrl+Shift+P` → "Extensions: Install from VSIX"
- Select the `.vsix` file
