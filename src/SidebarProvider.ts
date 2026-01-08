import * as vscode from "vscode";
import { DatasetController } from "./controllers/DatasetController";
import type { UserSession } from "./types";

interface MessageFromWebview {
  type: string;
  payload?: any;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  private controller?: DatasetController;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    controller?: DatasetController
  ) {
    this.controller = controller;
  }

  public setController(controller: DatasetController) {
    this.controller = controller;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message: MessageFromWebview) => {
      await this.handleMessage(message);
    });

    // Send initial wallet state when webview loads
    this.sendInitialState();
  }

  /**
   * Send initial state to webview when it first loads
   */
  private sendInitialState(): void {
    // Small delay to ensure webview is ready
    setTimeout(() => {
      const session = this.controller?.getUserSession();
      if (session && session.isConnected) {
        this.sendWalletConnected(session);
      }
    }, 100);
  }

  private async handleMessage(message: MessageFromWebview) {
    if (!this.controller) {
      this.sendMessage({
        type: 'error',
        payload: { message: 'Controller not initialized' },
      });
      return;
    }

    switch (message.type) {
      case 'requestWalletConnection':
        await vscode.commands.executeCommand('quantifyx.connectWallet');
        break;

      case 'walletConnected':
        await this.handleWalletConnected(message.payload);
        break;

      case 'disconnectWallet':
        await this.handleDisconnectWallet();
        break;

      case 'unlockDataset':
        await this.handleUnlockDataset(message.payload);
        break;

      case 'lockDataset':
        await this.handleLockDataset(message.payload);
        break;

      case 'openDataset':
        await this.handleOpenDataset(message.payload);
        break;

      case 'getMemoryStats':
        await this.handleGetMemoryStats();
        break;

      case 'error':
        this.handleError(message.payload);
        break;
    }
  }

  private async handleWalletConnected(payload: { address: string }) {
    // This now only handles messages FROM webview (deprecated flow)
    // Real connection happens via extension command
    vscode.window.showWarningMessage(
      'Please use the "Connect Wallet" command from the Command Palette for secure MetaMask authentication'
    );
  }

  private async handleDisconnectWallet() {
    // Trigger the disconnect command
    await vscode.commands.executeCommand('quantifyx.disconnectWallet');
  }

  /**
   * Notify webview of successful wallet connection
   */
  public sendWalletConnected(session: UserSession): void {
    this.sendMessage({
      type: 'walletConnected',
      payload: {
        address: session.walletAddress,
        connectedAt: session.connectedAt,
        isConnected: true
      }
    });
  }

  /**
   * Notify webview of wallet disconnection
   */
  public sendWalletDisconnected(): void {
    this.sendMessage({
      type: 'walletDisconnected'
    });
  }

  private async handleUnlockDataset(payload: { tokenId: string; cid: string }) {
    const success = await this.controller!.unlockDataset(payload.tokenId, payload.cid);

    if (success) {
      this.sendMessage({
        type: 'datasetUnlocked',
        payload: { tokenId: payload.tokenId },
      });
    }
  }

  private async handleLockDataset(payload: { tokenId: string }) {
    const success = await this.controller!.lockDataset(payload.tokenId);

    if (success) {
      this.sendMessage({
        type: 'datasetLocked',
        payload: { tokenId: payload.tokenId },
      });
    }
  }

  private async handleOpenDataset(payload: { tokenId: string }) {
    await this.controller!.openDataset(payload.tokenId);
  }

  private async handleGetMemoryStats() {
    const stats = this.controller!.getMemoryStats();

    this.sendMessage({
      type: 'memoryStats',
      payload: stats,
    });
  }

  private handleError(payload: { message: string }) {
    if (payload.message) {
      vscode.window.showErrorMessage(`Webview Error: ${payload.message}`);
    }
  }

  private sendMessage(message: { type: string; payload?: any }) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Point to the React build files we just created
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "build", "assets", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "build", "assets", "index.css")
    );

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="${styleUri}" rel="stylesheet">
        <title>QuantifyX</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
