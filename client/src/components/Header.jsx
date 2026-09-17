import React from 'react';
import { Bot, UserCheck, ShieldCheck, Wifi, Chrome, Trash2 } from 'lucide-react';

export default function Header({ isConnected, profile, onOpenProfile, testMode, browserStatus, onResetAllData, isBusy }) {
  const isCdp = browserStatus?.mode === 'CDP';
  const statusMsg = browserStatus?.message || (isCdp ? 'Connected to your existing Chrome session' : 'Standalone Browser Mode');

  const handleResetClick = () => {
    if (window.confirm("This will delete all discovered jobs and application history. Continue?")) {
      onResetAllData();
    }
  };

  return (
    <header className="app-header">
      <div className="brand-logo">
        <div className="brand-icon">
          <Bot size={24} />
        </div>
        <div>
          <h1 className="brand-title">AutoApply</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automated Job Application Engine</p>
        </div>
      </div>

      <div className="status-pills">
        <div className={`pill-badge ${isConnected ? 'live' : ''}`}>
          <Wifi size={14} />
          <span>{isConnected ? 'SSE Live Stream' : 'Connecting...'}</span>
        </div>

        <div className={`pill-badge ${isCdp ? 'live' : ''}`} title={statusMsg}>
          <Chrome size={14} />
          <span>{isCdp ? 'Connected to Chrome Session (CDP)' : (browserStatus?.mode ? 'Chrome CDP Off (Fallback)' : 'Chrome Engine')}</span>
        </div>

        {testMode && (
          <div className="pill-badge test-mode">
            <ShieldCheck size={14} />
            <span>TEST_MODE (Dry Run)</span>
          </div>
        )}

        {onResetAllData && (
          <button 
            className="btn btn-danger btn-sm" 
            onClick={handleResetClick} 
            disabled={isBusy}
            title={isBusy ? "Cannot reset while discovery or worker is running" : "Reset all discovered jobs and application queue"}
            style={{ background: 'transparent', border: '1px solid var(--accent-rose)', color: 'var(--accent-rose)' }}
          >
            <Trash2 size={15} />
            <span>Reset All Data</span>
          </button>
        )}

        <button className="btn btn-secondary btn-sm" onClick={onOpenProfile}>
          <UserCheck size={16} />
          <span>{profile?.name || 'Candidate Profile'}</span>
        </button>
      </div>
    </header>
  );
}


