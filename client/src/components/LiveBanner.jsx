import React from 'react';
import { Activity, AlertCircle } from 'lucide-react';

export default function LiveBanner({ statusBanner, recentLog }) {
  const { stage, currentJob, lastError } = statusBanner || {};

  return (
    <div style={{
      background: 'var(--bg-surface-elevated)',
      border: '1px solid var(--border-color-glow)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      justify: 'space-between',
      gap: '16px',
      boxShadow: 'var(--shadow-glow)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: stage?.includes('Running') || stage?.includes('Applying') || stage?.includes('Discovery') ? 'var(--accent-emerald)' : 'var(--accent-amber)',
          boxShadow: '0 0 10px currentColor'
        }} />
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Pipeline Status
          </span>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stage || 'Idle / Queue Ready'} {currentJob ? `— Applying to ${currentJob.company} (${currentJob.title})` : ''}
          </div>
        </div>
      </div>

      {recentLog && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: recentLog.level === 'error' ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
          {recentLog.level === 'error' ? <AlertCircle size={16} /> : <Activity size={16} />}
          <span>{recentLog.message}</span>
        </div>
      )}
    </div>
  );
}
