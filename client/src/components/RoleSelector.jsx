import React, { useState } from 'react';
import { Target, Play, Search } from 'lucide-react';

const TARGET_ROLE_OPTIONS = [
  'Software Developer',
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Developer',
  'React Developer',
  'Node.js Developer',
  'JavaScript Developer',
  'Web Developer',
  'Trainee Developer',
  'Graduate Software Developer'
];

export default function RoleSelector({ onStartDiscovery, isDiscoveryRunning }) {
  const [selectedRole, setSelectedRole] = useState('Software Developer');
  const [locations, setLocations] = useState('Chennai, Bangalore, Coimbatore, Salem, Remote');
  const [sources, setSources] = useState({
    linkedin: true,
    naukri: true,
    indeed: true,
    companyPortals: true
  });

  const handleSourceToggle = (key) => {
    const updated = { ...sources, [key]: !sources[key] };
    // Ensure at least one source stays checked
    const anyChecked = Object.values(updated).some(v => v);
    if (anyChecked) {
      setSources(updated);
    } else {
      alert('At least one platform source must remain checked.');
    }
  };

  const handleStart = async () => {
    try {
      const resp = await fetch('/api/chrome/status');
      const data = await resp.json().catch(() => ({}));
      if (data && data.success) {
        console.log('[RoleSelector] Pre-flight Chrome CDP check status:', data);
      }
    } catch (e) {
      console.warn('[RoleSelector] Pre-flight Chrome CDP check failed:', e);
    }

    const parsedLocations = locations.split(',').map(l => l.trim()).filter(Boolean);
    onStartDiscovery({
      roles: [selectedRole],
      locations: parsedLocations,
      sources
    });
  };

  return (
    <div className="glass-card">
      <div className="section-title">
        <Target size={20} />
        <span>STEP 2 — Role Selection & Search Targets</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="form-group">
          <label className="form-label">Target Role Position</label>
          <select 
            className="input-select" 
            value={selectedRole} 
            onChange={e => setSelectedRole(e.target.value)}
          >
            {TARGET_ROLE_OPTIONS.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Preferred Locations (Comma Separated)</label>
          <input 
            type="text" 
            className="input-text" 
            value={locations}
            onChange={e => setLocations(e.target.value)}
            placeholder="Chennai, Bangalore, Coimbatore, Remote" 
          />
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <label className="form-label" style={{ marginBottom: '10px', display: 'block' }}>Discovery Platform Sources</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {[
            { key: 'linkedin', label: 'LinkedIn Jobs' },
            { key: 'naukri', label: 'Naukri.com' },
            { key: 'indeed', label: 'Indeed' },
            { key: 'companyPortals', label: 'Company Career Portals' }
          ].map(src => (
            <label key={src.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input 
                type="checkbox" 
                checked={sources[src.key]} 
                onChange={() => handleSourceToggle(src.key)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} 
              />
              <span>{src.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn-primary" 
          onClick={handleStart} 
          disabled={isDiscoveryRunning}
        >
          {isDiscoveryRunning ? <Search size={18} className="spin" /> : <Play size={18} />}
          <span>{isDiscoveryRunning ? 'Searching Platforms...' : 'Start Auto Apply Pipeline'}</span>
        </button>
      </div>
    </div>
  );
}
