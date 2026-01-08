import * as vscode from 'vscode';
import * as http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import open from 'open';
import * as path from 'path';
import * as fs from 'fs';
import type { WalletAuthResult, AuthenticationChallenge } from '../types';

/**
 * WalletAuthService handles browser-based MetaMask wallet authentication.
 *
 * Flow:
 * 1. Generate cryptographic nonce
 * 2. Start temporary HTTP server on localhost
 * 3. Open system browser to authentication page
 * 4. User connects MetaMask and signs message
 * 5. Browser POSTs signed data to callback endpoint
 * 6. Verify signature using ethers.js
 * 7. Cleanup server and return result
 *
 * Security:
 * - Nonce prevents replay attacks
 * - Localhost-only binding (127.0.0.1)
 * - 2-minute timeout with auto-cleanup
 * - Cryptographic signature verification
 */
export class WalletAuthService {
  private server: http.Server | null = null;
  private authChallenge: AuthenticationChallenge | null = null;
  private authResolve: ((result: WalletAuthResult) => void) | null = null;
  private authReject: ((error: Error) => void) | null = null;

  private static readonly DEFAULT_PORT_START = 3000;
  private static readonly DEFAULT_PORT_END = 3099;
  private static readonly AUTH_TIMEOUT_MS = 120000; // 2 minutes

  /**
   * Main entry point for wallet authentication
   */
  async authenticate(
    cancellationToken?: vscode.CancellationToken
  ): Promise<WalletAuthResult> {
    try {
      // Cleanup any existing session
      await this.cleanup();

      // Generate nonce
      const nonce = this.generateNonce();
      const timestamp = Date.now();
      const expiresAt = timestamp + WalletAuthService.AUTH_TIMEOUT_MS;

      this.authChallenge = { nonce, timestamp, expiresAt };

      // Find available port
      const port = await this.findAvailablePort();

      // Start HTTP server
      await this.startAuthServer(port);

      // Open browser
      await this.openBrowser(nonce, port);

      // Wait for callback or timeout
      const result = await this.waitForCallback(cancellationToken);

      return result;
    } catch (error) {
      console.error('[WalletAuthService] Authentication failed:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Authentication failed'
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Generate random nonce for challenge-response authentication
   */
  private generateNonce(): string {
    const randomBytes = ethers.randomBytes(32);
    return ethers.hexlify(randomBytes);
  }

  /**
   * Find an available port in the specified range
   */
  private async findAvailablePort(): Promise<number> {
    for (
      let port = WalletAuthService.DEFAULT_PORT_START;
      port <= WalletAuthService.DEFAULT_PORT_END;
      port++
    ) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    throw new Error(
      `No available ports found in range ${WalletAuthService.DEFAULT_PORT_START}-${WalletAuthService.DEFAULT_PORT_END}`
    );
  }

  /**
   * Check if a port is available
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = http.createServer();

      testServer.once('error', () => {
        resolve(false);
      });

      testServer.once('listening', () => {
        testServer.close();
        resolve(true);
      });

      testServer.listen(port, '127.0.0.1');
    });
  }

  /**
   * Start Express HTTP server for authentication callback
   */
  private async startAuthServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const app = express();

      app.use(express.json());

      // CORS for localhost only
      app.use((req: Request, res: Response, next: NextFunction) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
      });

      // Serve authentication page
      app.get('/', (req: Request, res: Response) => {
        const html = this.getAuthPageHtml();
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      });

      // Callback endpoint
      app.post('/callback', async (req: Request, res: Response) => {
        try {
          const { address, signature, nonce } = req.body;

          if (!address || !signature || !nonce) {
            res.status(400).json({
              success: false,
              error: 'Missing required fields'
            });
            return;
          }

          // Verify nonce matches
          if (nonce !== this.authChallenge?.nonce) {
            res.status(400).json({
              success: false,
              error: 'Invalid or expired nonce'
            });
            return;
          }

          // Verify nonce hasn't expired
          if (Date.now() > (this.authChallenge?.expiresAt || 0)) {
            res.status(400).json({
              success: false,
              error: 'Authentication timeout'
            });
            return;
          }

          // Verify signature
          const isValid = await this.verifySignature(address, signature, nonce);

          if (!isValid) {
            res.status(400).json({
              success: false,
              error: 'Invalid signature'
            });
            return;
          }

          // Success
          res.json({ success: true });

          // Resolve authentication promise
          if (this.authResolve) {
            this.authResolve({
              success: true,
              walletAddress: address,
              signature
            });
          }
        } catch (error) {
          console.error('[WalletAuthService] Callback error:', error);
          res.status(500).json({
            success: false,
            error: 'Internal server error'
          });
        }
      });

      // Start server
      this.server = app.listen(port, '127.0.0.1', () => {
        console.log(
          `[WalletAuthService] Auth server started on http://localhost:${port}`
        );
        resolve();
      });

      this.server.once('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Open system browser to authentication page
   */
  private async openBrowser(nonce: string, port: number): Promise<void> {
    const url = `http://localhost:${port}/?nonce=${nonce}&port=${port}`;

    try {
      await open(url);
      console.log(`[WalletAuthService] Opened browser to ${url}`);
    } catch (error) {
      console.error('[WalletAuthService] Failed to open browser:', error);
      throw new Error(
        'Failed to open browser. Please manually navigate to: ' + url
      );
    }
  }

  /**
   * Wait for authentication callback or timeout
   */
  private async waitForCallback(
    cancellationToken?: vscode.CancellationToken
  ): Promise<WalletAuthResult> {
    return new Promise((resolve, reject) => {
      this.authResolve = resolve;
      this.authReject = reject;

      // Setup timeout
      const timeoutId = setTimeout(() => {
        reject(new Error('Authentication timeout (2 minutes)'));
      }, WalletAuthService.AUTH_TIMEOUT_MS);

      // Setup cancellation
      if (cancellationToken) {
        cancellationToken.onCancellationRequested(() => {
          clearTimeout(timeoutId);
          reject(new Error('Authentication cancelled by user'));
        });
      }

      // Clear timeout when resolved
      const originalResolve = resolve;
      this.authResolve = (result) => {
        clearTimeout(timeoutId);
        originalResolve(result);
      };

      const originalReject = reject;
      this.authReject = (error) => {
        clearTimeout(timeoutId);
        originalReject(error);
      };
    });
  }

  /**
   * Verify signature using ethers.js
   */
  private async verifySignature(
    address: string,
    signature: string,
    nonce: string
  ): Promise<boolean> {
    try {
      const message = `QuantifyX Wallet Verification\n\nNonce: ${nonce}\n\nSign this message to prove you own this wallet.\n\nThis signature cannot access your funds.`;

      const recoveredAddress = ethers.verifyMessage(message, signature);

      const isValid =
        recoveredAddress.toLowerCase() === address.toLowerCase();

      console.log(
        `[WalletAuthService] Signature verification: ${isValid ? 'VALID' : 'INVALID'}`
      );

      return isValid;
    } catch (error) {
      console.error('[WalletAuthService] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get authentication page HTML
   */
  private getAuthPageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QuantifyX - Connect Wallet</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0d0d0d;
      background-image:
        linear-gradient(135deg, #2d1b3d 0%, #1a0f2e 100%),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0px, rgba(255, 255, 255, 0.03) 1px, transparent 1px, transparent 40px),
        repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0px, rgba(255, 255, 255, 0.03) 1px, transparent 1px, transparent 40px);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        transform: translateY(-30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .logo {
      text-align: center;
      margin-bottom: 30px;
    }

    .logo h1 {
      background: linear-gradient(135deg, #ff007a 0%, #7b3fe4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
      text-shadow: 0 0 30px rgba(255, 0, 122, 0.3);
    }

    .logo p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
    }

    .content {
      text-align: center;
    }

    .description {
      color: rgba(255, 255, 255, 0.8);
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 30px;
    }

    .status {
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 14px;
      font-weight: 500;
    }

    .status.waiting {
      background: rgba(255, 107, 0, 0.1);
      color: #ff6b00;
      border: 1px solid rgba(255, 107, 0, 0.3);
    }

    .status.success {
      background: rgba(30, 180, 104, 0.1);
      color: #1eb468;
      border: 1px solid rgba(30, 180, 104, 0.3);
    }

    .status.error {
      background: rgba(255, 0, 122, 0.1);
      color: #ff007a;
      border: 1px solid rgba(255, 0, 122, 0.3);
    }

    .connect-btn {
      background: linear-gradient(135deg, #ff007a 0%, #7b3fe4 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 10px;
      cursor: pointer;
      width: 100%;
      transition: all 0.3s ease;
      box-shadow: 0 8px 25px rgba(255, 0, 122, 0.4);
      position: relative;
      overflow: hidden;
    }

    .connect-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      transition: left 0.5s;
    }

    .connect-btn:hover::before {
      left: 100%;
    }

    .connect-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 12px 35px rgba(255, 0, 122, 0.6);
    }

    .connect-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .connect-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      background: rgba(255, 0, 122, 0.1);
      color: #ff007a;
      border: 1px solid rgba(255, 0, 122, 0.3);
      padding: 15px;
      border-radius: 10px;
      margin-top: 20px;
      font-size: 14px;
      line-height: 1.5;
      display: none;
    }

    .error-message.show {
      display: block;
    }

    .error-message a {
      color: #7b3fe4;
      font-weight: 600;
      text-decoration: none;
    }

    .error-message a:hover {
      text-decoration: underline;
    }

    .info {
      margin-top: 20px;
      padding: 15px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.5;
    }

    .metamask-icon {
      width: 80px;
      height: 80px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg class="metamask-icon" viewBox="0 0 142 136.878" xmlns="http://www.w3.org/2000/svg">
        <path fill="#FF5C16" d="M132.682,132.192l-30.583-9.106l-23.063,13.787l-16.092-0.007l-23.077-13.78l-30.569,9.106L0,100.801l9.299-34.839L0,36.507L9.299,0l47.766,28.538h27.85L132.682,0l9.299,36.507l-9.299,29.455l9.299,34.839L132.682,132.192L132.682,132.192z"/>
        <path fill="#FF5C16" d="M9.305,0l47.767,28.558l-1.899,19.599L9.305,0z M39.875,100.814l21.017,16.01l-21.017,6.261C39.875,123.085,39.875,100.814,39.875,100.814z M59.212,74.345l-4.039-26.174L29.317,65.97l-0.014-0.007v0.013l0.08,18.321l10.485-9.951L59.212,74.345L59.212,74.345z M132.682,0L84.915,28.558l1.893,19.599L132.682,0z M102.113,100.814l-21.018,16.01l21.018,6.261V100.814z M112.678,65.975h0.007H112.678v-0.013l-0.006,0.007L86.815,48.171l-4.039,26.174h19.336l10.492,9.95C112.604,84.295,112.678,65.975,112.678,65.975z"/>
        <path fill="#E34807" d="M39.868,123.085l-30.569,9.106L0,100.814h39.868C39.868,100.814,39.868,123.085,39.868,123.085z M59.205,74.338l5.839,37.84l-8.093-21.04L29.37,84.295l10.491-9.956h19.344L59.205,74.338z M102.112,123.085l30.57,9.106l9.299-31.378h-39.869C102.112,100.814,102.112,123.085,102.112,123.085z M82.776,74.338l-5.839,37.84l8.092-21.04l27.583-6.843l-10.498-9.956H82.776V74.338z"/>
        <path fill="#FF8D5D" d="M0,100.801l9.299-34.839h19.997l0.073,18.327l27.584,6.843l8.092,21.039l-4.16,4.633l-21.017-16.01H0V100.801z M141.981,100.801l-9.299-34.839h-19.998l-0.073,18.327l-27.582,6.843l-8.093,21.039l4.159,4.633l21.018-16.01h39.868V100.801z M84.915,28.538h-27.85l-1.891,19.599l9.872,64.013h11.891l9.878-64.013L84.915,28.538z"/>
        <path fill="#661800" d="M9.299,0L0,36.507l9.299,29.455h19.997l25.87-17.804L9.299,0z M53.426,81.938h-9.059l-4.932,4.835l17.524,4.344l-3.533-9.186V81.938z M132.682,0l9.299,36.507l-9.299,29.455h-19.998L86.815,48.158L132.682,0z M88.568,81.938h9.072l4.932,4.841l-17.544,4.353l3.54-9.201V81.938z M79.029,124.385l2.067-7.567l-4.16-4.633h-11.9l-4.159,4.633l2.066,7.567"/>
        <path fill="#C0C4CD" d="M79.029,124.384v12.495H62.945v-12.495L79.029,124.384L79.029,124.384z"/>
        <path fill="#E7EBF6" d="M39.875,123.072l23.083,13.8v-12.495l-2.067-7.566C60.891,116.811,39.875,123.072,39.875,123.072z M102.113,123.072l-23.084,13.8v-12.495l2.067-7.566C81.096,116.811,102.113,123.072,102.113,123.072z"/>
      </svg>
      <h1>QuantifyX</h1>
      <p>Wallet Connection</p>
    </div>

    <div class="content">
      <p class="description">
        Sign a message with MetaMask to prove you own this wallet address.
        This signature is only used for authentication and cannot access your funds.
      </p>

      <div id="status" class="status waiting">
        Waiting for MetaMask...
      </div>

      <button id="connect-btn" class="connect-btn">
        Connect MetaMask
      </button>

      <div id="error" class="error-message"></div>

      <div class="info">
        <strong>What is MetaMask?</strong><br>
        MetaMask is a browser extension wallet for Ethereum. You'll need it installed to continue.
      </div>
    </div>
  </div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const nonce = urlParams.get('nonce');
    const callbackPort = urlParams.get('port');

    const statusEl = document.getElementById('status');
    const connectBtn = document.getElementById('connect-btn');
    const errorEl = document.getElementById('error');

    if (!nonce || !callbackPort) {
      showError('Invalid authentication request. Please try again from VS Code.');
      connectBtn.disabled = true;
    }

    function showStatus(message, type = 'waiting') {
      statusEl.textContent = message;
      statusEl.className = \`status \${type}\`;
    }

    function showError(message, link = null) {
      errorEl.innerHTML = message;
      if (link) {
        errorEl.innerHTML += \` <a href="\${link}" target="_blank">Learn more</a>\`;
      }
      errorEl.classList.add('show');
      statusEl.className = 'status error';
      statusEl.textContent = 'Connection failed';
    }

    function hideError() {
      errorEl.classList.remove('show');
    }

    async function connectWallet() {
      hideError();
      connectBtn.disabled = true;
      connectBtn.innerHTML = '<span class="spinner"></span>Connecting...';

      try {
        if (typeof window.ethereum === 'undefined') {
          throw new Error('MetaMask is not installed. Please install MetaMask to continue.|https://metamask.io/download');
        }

        showStatus('Requesting account access...', 'waiting');

        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });

        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts found in MetaMask. Please create or import a wallet first.');
        }

        const address = accounts[0];
        showStatus(\`Connected to \${address.slice(0, 6)}...\${address.slice(-4)}. Requesting signature...\`, 'waiting');

        connectBtn.innerHTML = '<span class="spinner"></span>Awaiting signature...';

        const message = \`QuantifyX Wallet Verification\\n\\nNonce: \${nonce}\\n\\nSign this message to prove you own this wallet.\\n\\nThis signature cannot access your funds.\`;

        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, address]
        });

        showStatus('Verifying signature...', 'waiting');
        connectBtn.innerHTML = '<span class="spinner"></span>Verifying...';

        const response = await fetch(\`http://localhost:\${callbackPort}/callback\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            address,
            signature,
            nonce
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Signature verification failed. Please try again.');
        }

        const result = await response.json();

        if (result.success) {
          showStatus('Success! You can close this window.', 'success');
          connectBtn.innerHTML = 'Success';
          connectBtn.style.background = '#28a745';

          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          throw new Error(result.error || 'Verification failed');
        }

      } catch (error) {
        console.error('Connection error:', error);

        let errorMessage = error.message || 'An unknown error occurred';
        let errorLink = null;

        if (errorMessage.includes('|')) {
          [errorMessage, errorLink] = errorMessage.split('|');
        }

        if (error.code === 4001) {
          errorMessage = 'You rejected the signature request. Please try again if you want to connect.';
        } else if (error.code === -32002) {
          errorMessage = 'A MetaMask request is already pending. Please check your MetaMask extension.';
        }

        showError(errorMessage, errorLink);
        connectBtn.disabled = false;
        connectBtn.innerHTML = 'Try Again';
        connectBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      }
    }

    connectBtn.addEventListener('click', connectWallet);

    if (window.ethereum) {
      showStatus('MetaMask detected. Click the button to connect.', 'waiting');
    } else {
      showStatus('MetaMask not detected', 'error');
      showError('MetaMask browser extension is not installed.', 'https://metamask.io/download');
    }
  </script>
</body>
</html>`;
  }

  /**
   * Cleanup server and reset state
   */
  private async cleanup(): Promise<void> {
    if (this.server) {
      const server = this.server;
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('[WalletAuthService] Server shut down');
          resolve();
        });
      });
      this.server = null;
    }

    this.authChallenge = null;
    this.authResolve = null;
    this.authReject = null;
  }
}
