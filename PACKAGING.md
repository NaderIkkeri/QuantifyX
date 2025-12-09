# QuantifyX Extension - Packaging & Installation Guide

## 📦 Package the Extension

### Prerequisites
```bash
npm install -g @vscode/vsce
```

### Build & Package
```bash
cd quantifyx

# Install dependencies
npm install

# Build webview UI
cd webview-ui
npm install
npm run build
cd ..

# Compile TypeScript
npm run compile

# Package as .vsix
vsce package
```

This will create `quantifyx-1.0.0.vsix` in the `quantifyx` folder.

---

## 💿 Install the Extension

### Method 1: From .vsix File (Recommended)

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Click the "..." menu in the top-right
4. Select "Install from VSIX..."
5. Choose `quantifyx-1.0.0.vsix`
6. Reload VS Code

### Method 2: Development Mode

1. Open VS Code
2. Open the `quantifyx` folder
3. Press F5 to launch Extension Development Host
4. A new VS Code window will open with the extension loaded

---

## 🎯 Using the Extension

### 1. Open the QuantifyX Sidebar

- Click the QuantifyX icon in the Activity Bar (left sidebar)
- Or press `Ctrl+Shift+P` and type "QuantifyX"

### 2. Connect Your Wallet

- Enter your Ethereum wallet address (0x...)
- Click "Connect"
- Your datasets will load automatically

### 3. Unlock & Use Datasets

- Find your dataset in the list (Owned / Purchased / Rented)
- Click "Unlock & Open"
- The extension will:
  1. Verify your access on the blockchain
  2. Download the encrypted file from IPFS
  3. Decrypt it in memory
  4. Open it in the editor

### 4. Use in Your Code

```python
import pandas as pd

# Read dataset from extension's virtual filesystem
data = pd.read_csv('quantifyx://1/dataset_1_Qm12345.csv')
print(data.head())
```

---

## 🔧 Troubleshooting

### Extension Not Showing in Sidebar

- Make sure the extension is installed
- Restart VS Code
- Check the Extensions view to see if it's enabled

### "Cannot connect wallet" Error

- Ensure you're entering a valid Ethereum address (0x... 42 characters)
- Get your address from MetaMask

### "Access denied" When Unlocking

- Verify you own/purchased/rented the dataset
- Check the correct wallet address is connected
- Ensure your rental hasn't expired

### Datasets Not Loading

- Check the backend is running (http://localhost:8000)
- Verify your wallet address is correct
- Click the refresh button (↻)

---

## 📋 Commands

All commands are available via `Ctrl+Shift+P`:

- **Connect Wallet** - Enter your wallet address
- **Unlock Dataset** - Unlock by Token ID and CID
- **Open Local Encrypted File** - Browse for downloaded .enc file
- **Open Dataset** - Open already-unlocked dataset
- **Lock Dataset** - Remove from memory
- **Clear All Datasets** - Remove all from memory
- **Show Memory Statistics** - View RAM usage
- **Configure Django Backend URL** - Change API endpoint

---

## ⚙️ Settings

Configure in VS Code Settings (Ctrl+,):

```json
{
  "quantifyx.djangoBackendUrl": "http://localhost:8000",
  "quantifyx.autoConnectWallet": false,
  "quantifyx.memoryLimitMB": 1024
}
```

---

## 🚀 Publishing to VS Code Marketplace

### Prerequisites

1. Create a [Visual Studio Marketplace account](https://marketplace.visualstudio.com/manage)
2. Create a Personal Access Token (PAT) from [Azure DevOps](https://dev.azure.com/)

### Publish

```bash
# Login with your PAT
vsce login quantifyx

# Publish
vsce publish
```

---

## 📝 Version Bumping

```bash
# Patch version (1.0.0 → 1.0.1)
npm version patch

# Minor version (1.0.0 → 1.1.0)
npm version minor

# Major version (1.0.0 → 2.0.0)
npm version major

# Package new version
vsce package
```

---

## 🔒 What's Different from Development Mode?

When installed from .vsix (not F5 development mode):

✅ **Runs in normal VS Code** (not Extension Development Host)
✅ **Shows in Activity Bar** with proper icon
✅ **Persists across sessions**
✅ **Can be used alongside other extensions**
✅ **More stable** (no hot-reload issues)

---

## ⚠️ Important Notes

1. **Backend Must Be Running**: The extension requires the Django backend at http://localhost:8000
2. **Wallet Address**: You need to manually enter your wallet address (MetaMask doesn't work in VS Code webviews)
3. **Dataset Paths**: Use the `quantifyx://` scheme in your code to access unlocked datasets
4. **RAM Only**: Datasets are stored in memory only - they're deleted when locked or expired

---

## 📦 Files Included in Package

```
quantifyx-1.0.0.vsix
├── extension.js          (Compiled extension code)
├── webview-ui/build/     (Built React app)
├── media/icon.png        (Extension icon)
├── package.json          (Manifest)
└── README.md             (Documentation)
```

---

**Need Help?** Check the main USER_GUIDE.md in the project root.
