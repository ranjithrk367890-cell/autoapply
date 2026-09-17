import React, { useState } from 'react';
import { UploadCloud, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { safeFetchJson } from '../utils/api';

export default function ResumeUploader({ profile, onProfileUpdated, onCompleteStep, onOpenAtsOptimizer }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadWarning, setUploadWarning] = useState(null);
  const [manualEmail, setManualEmail] = useState(profile?.email || '');
  const [manualPhone, setManualPhone] = useState(profile?.phone || '');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState(
    profile?.resumeFileName || (profile?.resumePath ? profile.resumePath.split(/[\\/]/).pop() : '')
  );

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setIsUploading(true);
    setUploadWarning(null);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const result = await safeFetchJson('/api/resume/upload', {
        method: 'POST',
        body: formData
      });

      if (result.ok && result.data && result.data.success) {
        onProfileUpdated(result.data.profile);
        setManualEmail(result.data.profile.email || '');
        setManualPhone(result.data.profile.phone || '');
        if (result.data.profile.resumeFileName) {
          setSelectedFileName(result.data.profile.resumeFileName);
        }
        if (result.data.warning) {
          setUploadWarning(result.data.warning);
        } else {
          setUploadSuccess(true);
        }
      } else {
        const errorMsg = result.data?.error || result.error || 'Failed to parse resume';
        setUploadWarning(`Resume Upload Notice: ${errorMsg}`);
        if (result.data?.parsed) {
          onProfileUpdated(result.data.parsed);
        }
      }
    } catch (err) {
      alert('Error uploading resume: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveContactDetails = async () => {
    if (!manualEmail || !manualPhone) {
      alert('Please fill in both Email and Phone to proceed.');
      return;
    }

    try {
      const result = await safeFetchJson('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: manualEmail,
          phone: manualPhone
        })
      });

      if (result.ok && result.data && result.data.success) {
        onProfileUpdated(result.data.profile);
        setUploadWarning(null);
        setUploadSuccess(true);
        if (onCompleteStep) onCompleteStep();
      } else {
        alert(result.data?.error || result.error || 'Failed to save profile');
      }
    } catch (err) {
      alert('Failed to save profile: ' + err.message);
    }
  };

  const currentFileName = selectedFileName || profile?.resumeFileName || (profile?.resumePath ? profile.resumePath.split(/[\\/]/).pop() : '');

  return (
    <div className="glass-card">
      <div className="section-title">
        <FileText size={20} />
        <span>STEP 1 — Resume Upload & Contact Verification</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <label className="input-file-dropzone" style={{
          border: '2px dashed var(--border-color-glow)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}>
          <UploadCloud size={32} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600 }}>{isUploading ? 'Parsing Resume PDF/DOCX...' : 'Click to Upload Resume (PDF, DOCX, TXT)'}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automated parser extracts skills, experience & contact details</span>
          <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>

        {currentFileName && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-surface)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent-primary)'
          }}>
            <FileText size={22} color="var(--accent-primary)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                Selected Resume File
              </div>
              <strong style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', wordBreak: 'break-all' }}>
                {currentFileName}
              </strong>
            </div>
            <span style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--accent-primary)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              Selected
            </span>
          </div>
        )}

        {uploadWarning && (
          <div className="warning-alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} />
              <strong>Warning: Missing Contact Information / Status Notice</strong>
            </div>
            <p>{uploadWarning}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input 
                  type="email" 
                  className="input-text" 
                  value={manualEmail} 
                  placeholder="ranjithkumarraman626@gmail.com"
                  onChange={e => setManualEmail(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input 
                  type="text" 
                  className="input-text" 
                  value={manualPhone} 
                  placeholder="+91 8056322161"
                  onChange={e => setManualPhone(e.target.value)} 
                />
              </div>
            </div>
            <button className="btn btn-warning btn-sm" style={{ alignSelf: 'flex-start' }} onClick={handleSaveContactDetails}>
              Confirm Contact Information & Proceed
            </button>
          </div>
        )}

        {profile && (
          <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--accent-primary)' }}>Parsed Candidate Profile & ATS Score:</strong>
                {uploadSuccess && <span style={{ color: 'var(--accent-emerald)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Ready</span>}
              </div>

              {onOpenAtsOptimizer && (
                <button 
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => onOpenAtsOptimizer()}
                >
                  ⚡ Boost ATS Resume Score to 80%+
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.825rem' }}>
              <div><strong>Name:</strong> {profile.name || 'Not set'}</div>
              <div><strong>Email:</strong> {profile.email || <span style={{ color: 'var(--accent-rose)' }}>Missing</span>}</div>
              <div><strong>Phone:</strong> {profile.phone || <span style={{ color: 'var(--accent-rose)' }}>Missing</span>}</div>
              <div><strong>Resume File:</strong> <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{currentFileName || 'None'}</span></div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong>Skills Found ({profile.skills?.length || 0}):</strong>{' '}
                <span style={{ color: 'var(--text-main)' }}>{(profile.skills || []).join(', ') || 'None'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
