import React, { useState } from 'react';
import { Play, Pause, Square, RefreshCw, Sliders, Shield } from 'lucide-react';

export default function WorkerControls({ workerState, onWorkerAction, config, onUpdateConfig }) {
  const [concurrency, setConcurrency] = useState(config?.maxConcurrency || 5);
  const [testMode, setTestMode] = useState(config?.testMode !== false);

  const handleConcurrencyChange = (val) => {
    const num = parseInt(val, 10);
    setConcurrency(num);
    onUpdateConfig({ maxConcurrency: num, testMode });
  };

  const handleTestModeToggle = () => {
    const nextVal = !testMode;
    setTestMode(nextVal);
    onUpdateConfig({ maxConcurrency: concurrency, testMode: nextVal });
  };

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="btn btn-primary"
            onClick={() => onWorkerAction('start')}
            disabled={workerState.isRunning && !workerState.isPaused}
          >
            <Play size={16} />
            <span>Start Queue</span>
          </button>

          {workerState.isRunning && !workerState.isPaused ? (
            <button className="btn btn-warning" onClick={() => onWorkerAction('pause')}>
              <Pause size={16} />
              <span>Pause Worker</span>
            </button>
          ) : (
            <button 
              className="btn btn-secondary" 
              onClick={() => onWorkerAction('resume')}
              disabled={!workerState.isPaused}
            >
              <RefreshCw size={16} />
              <span>Resume Worker</span>
            </button>
          )}

          <button className="btn btn-danger" onClick={() => onWorkerAction('stop')}>
            <Square size={16} />
            <span>Stop Worker</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Max Concurrency:</span>
            <select 
              className="input-select" 
              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
              value={concurrency}
              onChange={e => handleConcurrencyChange(e.target.value)}
            >
              {[1, 2, 3, 4, 5, 8, 10].map(n => (
                <option key={n} value={n}>{n} Threads</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
            <Shield size={16} color={testMode ? 'var(--accent-amber)' : 'var(--text-muted)'} />
            <input 
              type="checkbox" 
              checked={testMode} 
              onChange={handleTestModeToggle}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-amber)' }}
            />
            <span>TEST_MODE (Dry Run)</span>
          </label>
        </div>
      </div>
    </div>
  );
}
