import { useState, useEffect } from 'react';
import './App.css';
import type { MessageFromWebview, MessageToWebview, WalletInfo, DatasetInfo, MemoryStats } from './types';

// VS Code API
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

function App() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [cidInput, setCidInput] = useState('');

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageToWebview>) => {
      const message = event.data;

      switch (message.type) {
        case 'walletConnected':
          setWalletInfo(message.payload);
          break;

        case 'walletDisconnected':
          setWalletInfo(null);
          break;

        case 'datasetUnlocked':
          // Refresh dataset list
          requestMemoryStats();
          break;

        case 'datasetLocked':
          // Refresh dataset list
          requestMemoryStats();
          break;

        case 'memoryStats':
          setMemoryStats(message.payload);
          updateDatasetList(message.payload);
          break;

        case 'error':
          console.error('Error from extension:', message.payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Request initial memory stats
  useEffect(() => {
    requestMemoryStats();
    const interval = setInterval(requestMemoryStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const updateDatasetList = (stats: MemoryStats) => {
    const datasetList: DatasetInfo[] = stats.datasets.map(ds => ({
      tokenId: ds.tokenId,
      filename: ds.filename,
      expiresIn: ds.expiresIn,
      expiresAt: new Date(Date.now() + ds.expiresIn).toLocaleString(),
    }));
    setDatasets(datasetList);
  };

  const sendMessage = (message: MessageFromWebview) => {
    vscode.postMessage(message);
  };

  const requestMemoryStats = () => {
    sendMessage({ type: 'getMemoryStats' });
  };

  const handleConnectWallet = () => {
    sendMessage({ type: 'connectWallet' });
  };

  const handleDisconnectWallet = () => {
    sendMessage({ type: 'disconnectWallet' });
  };

  const handleUnlockDataset = () => {
    if (!tokenIdInput.trim() || !cidInput.trim()) {
      alert('Please enter both Token ID and CID');
      return;
    }

    sendMessage({
      type: 'unlockDataset',
      payload: {
        tokenId: tokenIdInput.trim(),
        cid: cidInput.trim(),
      },
    });

    // Clear inputs
    setTokenIdInput('');
    setCidInput('');
  };

  const handleLockDataset = (tokenId: string) => {
    sendMessage({
      type: 'lockDataset',
      payload: { tokenId },
    });
  };

  const handleOpenDataset = (tokenId: string) => {
    sendMessage({
      type: 'openDataset',
      payload: { tokenId },
    });
  };

  const formatExpiresIn = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  return (
    <div className="container">
      <header className="header">
        <h1>QuantifyX</h1>
        <p className="subtitle">Secure Data Analysis Platform</p>
      </header>

      {/* Wallet Connection Section */}
      <section className="section">
        <h2>Wallet Connection</h2>
        {!walletInfo?.isConnected ? (
          <button className="btn btn-primary" onClick={handleConnectWallet}>
            Connect Wallet
          </button>
        ) : (
          <div className="wallet-info">
            <div className="info-row">
              <span className="label">Address:</span>
              <span className="value monospace">{walletInfo.address}</span>
            </div>
            <button className="btn btn-secondary" onClick={handleDisconnectWallet}>
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* Unlock Dataset Section */}
      {walletInfo?.isConnected && (
        <section className="section">
          <h2>Unlock Dataset</h2>
          <div className="form-group">
            <label htmlFor="tokenId">Token ID</label>
            <input
              id="tokenId"
              type="text"
              className="input"
              placeholder="Enter token ID (e.g., 1, 2, 3)"
              value={tokenIdInput}
              onChange={(e) => setTokenIdInput(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="cid">IPFS CID</label>
            <input
              id="cid"
              type="text"
              className="input"
              placeholder="Enter IPFS CID (e.g., Qm...)"
              value={cidInput}
              onChange={(e) => setCidInput(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleUnlockDataset}>
            Unlock & Open Dataset
          </button>
        </section>
      )}

      {/* Active Datasets Section */}
      <section className="section">
        <h2>Active Datasets</h2>
        {memoryStats && (
          <div className="stats-box">
            <div className="stat-item">
              <span className="stat-label">Count:</span>
              <span className="stat-value">{memoryStats.datasetCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Memory:</span>
              <span className="stat-value">{memoryStats.totalSizeMB.toFixed(2)} MB</span>
            </div>
          </div>
        )}

        {datasets.length === 0 ? (
          <p className="empty-state">No datasets unlocked yet</p>
        ) : (
          <div className="dataset-list">
            {datasets.map((dataset) => (
              <div key={dataset.tokenId} className="dataset-card">
                <div className="dataset-header">
                  <h3 className="dataset-title">{dataset.filename}</h3>
                  <span className="dataset-token">#{dataset.tokenId}</span>
                </div>
                <div className="dataset-info">
                  <div className="info-row">
                    <span className="label">Expires in:</span>
                    <span className="value">{formatExpiresIn(dataset.expiresIn)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Expires at:</span>
                    <span className="value">{dataset.expiresAt}</span>
                  </div>
                </div>
                <div className="dataset-actions">
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => handleOpenDataset(dataset.tokenId)}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => handleLockDataset(dataset.tokenId)}
                  >
                    Lock
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
