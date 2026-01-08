import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { DjangoApiClient } from './services/DjangoApiClient';
import { DecryptionService } from './services/DecryptionService';
import { InMemoryDatasetManager } from './services/InMemoryDatasetManager';
import { DatasetFileSystemProvider } from './providers/DatasetFileSystemProvider';
import { DatasetController } from './controllers/DatasetController';
import { StorageService } from './services/StorageService';
import { WalletAuthService } from './services/WalletAuthService';
import type { UserSession } from './types';

export function activate(context: vscode.ExtensionContext) {
  console.log('QuantifyX extension is now active!');

  // Initialize services
  const storageService = new StorageService(context);
  const walletAuthService = new WalletAuthService();
  const apiClient = new DjangoApiClient();
  const decryptionService = new DecryptionService();
  const datasetManager = new InMemoryDatasetManager();
  const fsProvider = new DatasetFileSystemProvider(datasetManager);
  const controller = new DatasetController(
    apiClient,
    decryptionService,
    datasetManager,
    fsProvider,
    storageService
  );

  // Register virtual file system for in-memory datasets
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('quantifyx', fsProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    })
  );

  // Create the sidebar provider
  const sidebarProvider = new SidebarProvider(context.extensionUri, controller);

  // Auto-restore wallet session on activation (after sidebar provider is created)
  restoreWalletSession(controller, sidebarProvider).catch(err => {
    console.error('[Extension] Failed to restore wallet session:', err);
  });

  // Register sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'quantifyx-sidebar',
      sidebarProvider
    )
  );

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'quantifyx.showMemoryStats';
  context.subscriptions.push(statusBarItem);

  // Update status bar periodically
  const updateStatusBar = () => {
    const stats = datasetManager.getMemoryStats();
    if (stats.datasetCount > 0) {
      statusBarItem.text = `$(database) ${stats.datasetCount} dataset(s) | ${stats.totalSizeMB.toFixed(1)} MB`;
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  };

  updateStatusBar();
  const statusBarInterval = setInterval(updateStatusBar, 5000);
  context.subscriptions.push(new vscode.Disposable(() => clearInterval(statusBarInterval)));

  // Command: Unlock Dataset
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.unlockDataset', async () => {
      const session = controller.getUserSession();
      if (!session || !session.isConnected) {
        vscode.window.showErrorMessage('Please connect your wallet first');
        return;
      }

      const tokenId = await vscode.window.showInputBox({
        prompt: 'Enter dataset Token ID',
        placeHolder: '1',
      });

      if (!tokenId) {
        return;
      }

      const cid = await vscode.window.showInputBox({
        prompt: 'Enter IPFS CID',
        placeHolder: 'Qm...',
      });

      if (!cid) {
        return;
      }

      await controller.unlockDataset(tokenId, cid);
    })
  );

  // Command: Open Local Encrypted File
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.openLocalFile', async () => {
      await controller.openLocalFile();
    })
  );

  // Command: Open Dataset
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.openDataset', async () => {
      const datasets = controller.getActiveDatasets();

      if (datasets.length === 0) {
        vscode.window.showInformationMessage('No datasets unlocked');
        return;
      }

      const selected = await vscode.window.showQuickPick(
        datasets.map(ds => ({
          label: ds.filename,
          description: `Token #${ds.tokenId}`,
          detail: `Expires in ${formatDuration(ds.expiresIn)}`,
          tokenId: ds.tokenId,
        })),
        {
          placeHolder: 'Select a dataset to open',
        }
      );

      if (selected) {
        await controller.openDataset(selected.tokenId);
      }
    })
  );

  // Command: Lock Dataset
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.lockDataset', async () => {
      const datasets = controller.getActiveDatasets();

      if (datasets.length === 0) {
        vscode.window.showInformationMessage('No datasets unlocked');
        return;
      }

      const selected = await vscode.window.showQuickPick(
        datasets.map(ds => ({
          label: ds.filename,
          description: `Token #${ds.tokenId}`,
          tokenId: ds.tokenId,
        })),
        {
          placeHolder: 'Select a dataset to lock',
        }
      );

      if (selected) {
        await controller.lockDataset(selected.tokenId);
      }
    })
  );

  // Command: Clear All Datasets
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.clearAllDatasets', async () => {
      await controller.clearAllDatasets();
      updateStatusBar();
    })
  );

  // Command: Show Memory Stats
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.showMemoryStats', async () => {
      const stats = controller.getMemoryStats();

      if (stats.datasetCount === 0) {
        vscode.window.showInformationMessage('No datasets in memory');
        return;
      }

      const message = `
**QuantifyX Memory Usage**

Total Datasets: ${stats.datasetCount}
Total Memory: ${stats.totalSizeMB.toFixed(2)} MB

**Active Datasets:**
${stats.datasets.map(ds => `
• ${ds.filename} (Token #${ds.tokenId})
  Size: ${ds.sizeMB.toFixed(2)} MB
  Expires in: ${formatDuration(ds.expiresIn)}
`).join('\n')}
      `.trim();

      const selected = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Clear All'
      );

      if (selected === 'Clear All') {
        await controller.clearAllDatasets();
        updateStatusBar();
      }
    })
  );

  // Command: Connect Wallet (MetaMask)
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.connectWallet', async () => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Connecting to MetaMask...',
            cancellable: true,
          },
          async (progress, token) => {
            progress.report({ message: 'Opening browser for MetaMask authentication...' });

            const result = await walletAuthService.authenticate(token);

            if (result.success && result.walletAddress) {
              const session: UserSession = {
                walletAddress: result.walletAddress,
                connectedAt: Date.now(),
                isConnected: true,
              };

              await controller.setUserSession(session);

              vscode.window.showInformationMessage(
                `Wallet connected: ${result.walletAddress.slice(0, 6)}...${result.walletAddress.slice(-4)}`
              );

              // Notify webview
              sidebarProvider.sendWalletConnected(session);
            } else {
              throw new Error(result.error || 'Connection cancelled');
            }
          }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Wallet connection failed: ${errorMsg}`);
      }
    })
  );

  // Command: Disconnect Wallet
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.disconnectWallet', async () => {
      const session: UserSession = {
        walletAddress: '',
        connectedAt: 0,
        isConnected: false,
      };

      await controller.setUserSession(session);
      vscode.window.showInformationMessage('Wallet disconnected');

      // Notify webview
      sidebarProvider.sendWalletDisconnected();
    })
  );

  // Command: Configure Django Backend URL
  context.subscriptions.push(
    vscode.commands.registerCommand('quantifyx.configureDjangoUrl', async () => {
      const config = vscode.workspace.getConfiguration('quantifyx');
      const currentUrl = config.get('djangoBackendUrl', 'http://localhost:8000');

      const newUrl = await vscode.window.showInputBox({
        prompt: 'Enter Django backend URL',
        value: currentUrl,
        placeHolder: 'http://localhost:8000',
      });

      if (newUrl) {
        await config.update('djangoBackendUrl', newUrl, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Django backend URL updated to: ${newUrl}`);
      }
    })
  );

  // Cleanup on deactivation
  context.subscriptions.push(
    new vscode.Disposable(() => {
      apiClient.dispose();
      decryptionService.dispose();
      datasetManager.dispose();
    })
  );

  console.log('QuantifyX extension fully initialized!');
}

export function deactivate() {
  console.log('QuantifyX extension deactivated');
}

/**
 * Auto-restore wallet session on extension activation
 */
async function restoreWalletSession(
  controller: DatasetController,
  sidebarProvider: SidebarProvider
): Promise<void> {
  const config = vscode.workspace.getConfiguration('quantifyx');
  const autoConnect = config.get<boolean>('autoConnectWallet', true);

  if (!autoConnect) {
    console.log('[Extension] Auto-connect disabled, skipping wallet restore');
    return;
  }

  try {
    const session = await controller.loadPersistedSession();

    if (session) {
      await controller.setUserSession(session);

      console.log('[Extension] Wallet session restored successfully:', session.walletAddress);

      // Note: Webview will be notified when it loads via sendInitialState()
      // No need to notify here as webview might not be ready yet
    } else {
      console.log('[Extension] No valid wallet session found');
    }
  } catch (error) {
    console.error('[Extension] Failed to restore wallet session:', error);
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
