import { useState, useEffect } from 'react';
import './App.css';
import { VSCodeButton, VSCodeDivider } from '@vscode/webview-ui-toolkit/react';

// --- Type Definitions ---

interface WalletInfo {
  isConnected: boolean;
  address: string;
  connectedAt: number;
}

interface DatasetInfo {
  tokenId: string;
  filename: string;
  expiresIn: number;
}

interface UserDataset {
  token_id: number;
  name: string;
  description: string;
  category: string;
  format: string;
  ipfs_cid: string;
  price: string;
  owner: string;
}

interface MemoryStats {
  datasetCount: number;
  totalSizeMB: number;
  datasets: DatasetInfo[];
}

// Interface for messages sent TO the extension
interface ExtensionMessage {
  type: string;
  payload?: unknown;
}

// Interface for the VS Code API
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Declare the API function properly instead of using 'any'
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

function App() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]); // Active memory datasets
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  
  // User's Owned/Rented/Purchased Datasets
  const [userDatasets, setUserDatasets] = useState<{ owned: UserDataset[], purchased: UserDataset[], rented: UserDataset[] } | null>(null);
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // --- 1. Message Handling (Listener) ---
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'walletConnected':
          setWalletInfo(message.payload);
          fetchUserDatasets(message.payload.address); // Auto-fetch on connect
          break;

        case 'walletDisconnected':
          setWalletInfo(null);
          setUserDatasets(null);
          break;

        case 'connectionError':
          alert(`Connection failed: ${message.payload.message}`);
          break;

        case 'memoryStats':
          setMemoryStats(message.payload);
          updateDatasetList(message.payload);
          break;

        case 'datasetUnlocked':
        case 'datasetLocked':
          requestMemoryStats(); // Refresh memory stats on changes
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // --- 2. Auto-Refresh Memory Stats ---
  useEffect(() => {
    requestMemoryStats();
    const interval = setInterval(requestMemoryStats, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  // --- 3. Helper Functions ---

  // Replaced 'any' with the ExtensionMessage interface
  const sendMessage = (msg: ExtensionMessage) => {
    vscode.postMessage(msg);
  };

  const requestMemoryStats = () => {
    sendMessage({ type: 'getMemoryStats' });
  };

  const updateDatasetList = (stats: MemoryStats) => {
    setDatasets(stats.datasets || []);
  };

  // --- 4. Wallet Actions ---

  const handleConnectWallet = () => {
    sendMessage({ type: 'requestWalletConnection' });
  };

  const handleDisconnectWallet = () => {
    sendMessage({ type: 'disconnectWallet' });
    setWalletInfo(null);
    setUserDatasets(null);
  };

  // --- 5. Dataset Actions ---

  const handleUnlock = (tokenId: number, cid: string) => {
    sendMessage({
      type: 'unlockDataset',
      payload: { tokenId: tokenId.toString(), cid }
    });
  };

  const handleOpenActive = (tokenId: string) => {
    sendMessage({ type: 'openDataset', payload: { tokenId } });
  };

  const handleLockActive = (tokenId: string) => {
    sendMessage({ type: 'lockDataset', payload: { tokenId } });
  };

  // --- 6. API Fetch Logic ---
  const fetchUserDatasets = async (address: string) => {
    setLoadingDatasets(true);
    try {
      // NOTE: Ensure your backend is running at localhost:8000
      const response = await fetch(`http://127.0.0.1:8000/api/datasets/user-datasets/${address}/`);
      
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      
      const data = await response.json();
      console.log('API Data:', data);

      if (data.success) {
        setUserDatasets({
          owned: data.owned || [],
          purchased: data.purchased || [],
          rented: data.rented || []
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDatasets(false);
    }
  };

  // --- 7. Render ---

  const totalCount = userDatasets 
    ? (userDatasets.owned.length + userDatasets.purchased.length + userDatasets.rented.length) 
    : 0;

  return (
    <div className="container">
      <div className="header">
        <h1>QuantifyX</h1>
        <p>Secure Data Node</p>
      </div>
      
      <VSCodeDivider />

      {/* Login State */}
      {!walletInfo ? (
        <div className="login-section">
          <p>Connect your MetaMask wallet to access datasets</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            <VSCodeButton onClick={handleConnectWallet}>
              Connect with MetaMask
            </VSCodeButton>
            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '10px', textAlign: 'center' }}>
              This will open your browser to connect MetaMask
            </p>
          </div>
        </div>
      ) : (
        <div className="dashboard">
          <div className="status-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem' }}>🟢 {walletInfo.address.slice(0, 6)}...{walletInfo.address.slice(-4)}</span>
            <VSCodeButton appearance="secondary" onClick={handleDisconnectWallet}>Disconnect</VSCodeButton>
          </div>

          {/* ACTIVE MEMORY SECTION */}
          {memoryStats && memoryStats.datasetCount > 0 && (
            <div className="memory-section">
              <h3>⚡ Active Memory ({memoryStats.datasetCount})</h3>
              {datasets.map(ds => (
                <div key={ds.tokenId} className="memory-card">
                  <div className="memory-info">
                    <strong>#{ds.tokenId}</strong>
                    <span>{ds.filename}</span>
                  </div>
                  <div className="memory-actions">
                    <VSCodeButton onClick={() => handleOpenActive(ds.tokenId)}>Open</VSCodeButton>
                    <VSCodeButton appearance="secondary" onClick={() => handleLockActive(ds.tokenId)}>Lock</VSCodeButton>
                  </div>
                </div>
              ))}
              <VSCodeDivider />
            </div>
          )}

          {/* CLOUD DATASETS SECTION */}
          <div className="cloud-section">
            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>☁️ Your Datasets ({totalCount})</h3>
              <VSCodeButton appearance="icon" aria-label="Refresh" onClick={() => fetchUserDatasets(walletInfo.address)}>
                <span className="codicon codicon-refresh">↻</span>
              </VSCodeButton>
            </div>

            {loadingDatasets ? <p>Loading...</p> : (
              <div className="dataset-list">
                {/* OWNED */}
                {userDatasets?.owned.map(ds => (
                  <div key={ds.token_id} className="dataset-card owned">
                    <span className="badge">OWNED</span>
                    <h4>{ds.name}</h4>
                    <p>#{ds.token_id} • {ds.format}</p>
                    <VSCodeButton onClick={() => handleUnlock(ds.token_id, ds.ipfs_cid)}>
                      Decrypt & Load
                    </VSCodeButton>
                  </div>
                ))}

                {/* RENTED */}
                {userDatasets?.rented.map(ds => (
                  <div key={ds.token_id} className="dataset-card rented">
                    <span className="badge">RENTED</span>
                    <h4>{ds.name}</h4>
                    <VSCodeButton onClick={() => handleUnlock(ds.token_id, ds.ipfs_cid)}>
                      Decrypt & Load
                    </VSCodeButton>
                  </div>
                ))}
                
                {totalCount === 0 && <p style={{ opacity: 0.7, marginTop: '20px' }}>No datasets found.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;