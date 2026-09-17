import React, { useState } from 'react';
import { ExternalLink, CheckCircle, HelpCircle, AlertTriangle, Search, Loader2, Clock, LayoutGrid } from 'lucide-react';

export default function ApplicationsTable({ applications, onProvideAnswer, onResolveManual, onOpenAtsOptimizer }) {
  const [searchQuery, setSearchQuery] = useState('');

  const searchFilteredApps = (applications || []).filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (app.company || '').toLowerCase().includes(q) ||
           (app.role || '').toLowerCase().includes(q) ||
           (app.source || '').toLowerCase().includes(q);
  });

  const sortByRecent = (list) => {
    return [...list].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.appliedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.appliedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  };

  const mainColumns = [
    {
      id: 'APPLYING',
      title: 'Applying',
      icon: <Loader2 size={16} className="spin-icon" style={{ color: 'var(--accent-cyan)' }} />,
      badgeStyle: {
        background: 'rgba(6, 182, 212, 0.15)',
        color: 'var(--accent-cyan)',
        border: '1px solid rgba(6, 182, 212, 0.3)'
      },
      emptyMessage: 'No active application processing.'
    },
    {
      id: 'APPLIED',
      title: 'Applied (Verified)',
      icon: <CheckCircle size={16} style={{ color: 'var(--accent-emerald)' }} />,
      badgeStyle: {
        background: 'rgba(16, 185, 129, 0.15)',
        color: 'var(--accent-emerald)',
        border: '1px solid rgba(16, 185, 129, 0.3)'
      },
      emptyMessage: 'No verified applications yet.'
    },
    {
      id: 'UNCONFIRMED',
      title: 'Unconfirmed',
      icon: <Clock size={16} style={{ color: 'var(--accent-amber)' }} />,
      badgeStyle: {
        background: 'rgba(245, 158, 11, 0.15)',
        color: 'var(--accent-amber)',
        border: '1px solid rgba(245, 158, 11, 0.3)'
      },
      emptyMessage: 'No unconfirmed submissions.'
    },
    {
      id: 'FAILED',
      title: 'Failed',
      icon: <AlertTriangle size={16} style={{ color: 'var(--accent-rose)' }} />,
      badgeStyle: {
        background: 'rgba(244, 63, 94, 0.15)',
        color: 'var(--accent-rose)',
        border: '1px solid rgba(244, 63, 94, 0.3)'
      },
      emptyMessage: 'No failed attempts.'
    }
  ];

  const getAppsForStatus = (statusId) => {
    return sortByRecent(searchFilteredApps.filter(app => app.status === statusId));
  };

  const otherApps = sortByRecent(searchFilteredApps.filter(app => 
    !['APPLYING', 'APPLIED', 'UNCONFIRMED', 'FAILED'].includes(app.status)
  ));

  const totalMainAppsCount = searchFilteredApps.length;

  const renderCard = (app) => (
    <div className="kanban-card" key={app._id || app.jobId || `${app.company}-${app.role}`}>
      <div className="kanban-card-top">
        <div>
          <div className="kanban-card-company">{app.company}</div>
          <div className="kanban-card-role">{app.role}</div>
        </div>
        <span className="kanban-source-pill">{app.source}</span>
      </div>

      <div className="kanban-card-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>{app.location || 'Remote / Flexible'}</span>
          <span>•</span>
          <span>{app.postedDateRaw || (app.postedDate ? new Date(app.postedDate).toLocaleDateString() : 'Recent')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: app.matchScore > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)', fontSize: '0.75rem' }}>
            {app.matchScore > 0 ? `${app.matchScore}% Match` : 'Score: N/A'}
          </span>
        </div>
      </div>


      <div className="kanban-card-detail">
        {app.status === 'APPLYING' && (
          <div style={{ fontSize: '0.775rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <Loader2 size={13} className="spin-icon" />
            <span>{app.statusMessage || 'Processing in automated browser...'}</span>
          </div>
        )}

        {app.status === 'APPLIED' && (
          <div style={{ fontSize: '0.775rem', color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={13} />
            <span>{app.statusMessage || (app.appliedAt ? `Applied at ${new Date(app.appliedAt).toLocaleTimeString()}` : 'Submitted Successfully')}</span>
          </div>
        )}

        {app.status === 'UNCONFIRMED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
              {app.statusMessage || 'Form submitted, manual confirmation recommended.'}
            </div>
            {app.applyUrl && (
              <a 
                href={app.applyUrl} 
                target="_blank" 
                rel="noreferrer"
                style={{ fontSize: '0.725rem', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
              >
                <ExternalLink size={12} />
                <span>Check Submission</span>
              </a>
            )}
          </div>
        )}

        {app.status === 'FAILED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-rose)',
              fontSize: '0.75rem',
              lineHeight: '1.3'
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Failed:</strong> {app.failureReason || app.statusMessage || 'Error encountered during automation.'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {onResolveManual && (
                <button 
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                  onClick={() => onResolveManual(app._id)}
                >
                  🔄 Retry
                </button>
              )}
              {app.applyUrl && (
                <a 
                  href={app.applyUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                >
                  <ExternalLink size={11} />
                  <span>Open Link</span>
                </a>
              )}
            </div>
          </div>
        )}

        {app.status === 'ANSWER_REQUIRED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              color: '#06b6d4',
              fontSize: '0.75rem'
            }}>
              <strong>Screening Question Required:</strong> {app.questionPrompt || app.statusMessage}
            </div>
            {onProvideAnswer && (
              <button 
                className="btn btn-warning btn-sm"
                style={{ alignSelf: 'flex-start', fontSize: '0.725rem', padding: '3px 8px' }}
                onClick={() => onProvideAnswer(app)}
              >
                <HelpCircle size={13} />
                <span>Provide Answer</span>
              </button>
            )}
          </div>
        )}

        {app.status === 'MANUAL_REQUIRED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-amber)',
              fontSize: '0.75rem'
            }}>
              <strong>Manual Step Required:</strong> {app.statusMessage || 'Login / CAPTCHA check required.'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {app.applyUrl && (
                <a 
                  href={app.applyUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                >
                  <ExternalLink size={12} />
                  <span>Open Job</span>
                </a>
              )}
              {app._id && (
                <a 
                  href={`/api/applications/${app._id}/download-tailored`} 
                  target="_blank"
                  download
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.725rem', padding: '3px 8px', color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
                >
                  📄 Resume
                </a>
              )}
              {onResolveManual && app._id && (
                <button 
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                  onClick={() => onResolveManual(app._id)}
                >
                  <CheckCircle size={12} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          </div>
        )}

        {app.status === 'READY' && (
          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
            {app.statusMessage || 'Queued for auto-application'}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div className="section-title" style={{ margin: 0 }}>
          <LayoutGrid size={20} style={{ color: 'var(--accent-primary)' }} />
          <span>Application Processing Board ({totalMainAppsCount})</span>
        </div>

        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="input-text" 
            style={{ paddingLeft: '32px', fontSize: '0.85rem', width: '100%' }} 
            placeholder="Search company or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 4-Column Kanban Board */}
      <div className="kanban-board">
        {mainColumns.map(col => {
          const colApps = getAppsForStatus(col.id);
          return (
            <div className="kanban-column" key={col.id}>
              <div className="kanban-column-header">
                <div className="kanban-column-title">
                  {col.icon}
                  <span>{col.title}</span>
                </div>
                <span className="kanban-count-badge" style={col.badgeStyle}>
                  {colApps.length}
                </span>
              </div>

              <div className="kanban-cards-list">
                {colApps.length === 0 ? (
                  <div className="kanban-empty-state">
                    {col.emptyMessage}
                  </div>
                ) : (
                  colApps.map(app => renderCard(app))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Other Statuses Section (Ready Queue, Screening Questions, Manual Steps) */}
      {otherApps.length > 0 && (
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Action Items & Queue ({otherApps.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {otherApps.map(app => renderCard(app))}
          </div>
        </div>
      )}
    </div>
  );
}
