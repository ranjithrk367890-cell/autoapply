import React from 'react';
import { BarChart3 } from 'lucide-react';

export default function DashboardStats({ stats }) {
  const statItems = [
    { label: 'Jobs Found', val: stats?.jobsFound || 0 },
    { label: '7-Day Active', val: stats?.sevenDayActiveJobs || 0 },
    { label: 'Duplicates Removed', val: stats?.duplicatesRemoved || 0 },
    { label: 'Ready Queue', val: stats?.ready || 0 },
    { label: 'Applying Now', val: stats?.applying || 0, class: 'applying' },
    { label: 'Applied (Verified)', val: stats?.applied || 0, class: 'applied' },
    { label: 'Unconfirmed', val: stats?.unconfirmed || 0 },
    { label: 'Answer Required', val: stats?.answerRequired || 0, class: 'answer' },
    { label: 'Manual Required', val: stats?.manualRequired || 0, class: 'manual' },
    { label: 'Failed', val: stats?.failed || 0, class: 'failed' },
    { label: 'Remaining', val: stats?.remaining || 0 }
  ];

  return (
    <div className="glass-card">
      <div className="section-title">
        <BarChart3 size={20} />
        <span>Pipeline Execution Metrics</span>
      </div>

      <div className="stats-grid">
        {statItems.map((item, idx) => (
          <div key={idx} className={`stat-card ${item.class || ''}`}>
            <span className="stat-val">{item.val}</span>
            <span className="stat-lbl">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
