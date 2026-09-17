import React, { useState, useEffect } from 'react';
import { Target, Zap, CheckCircle, AlertCircle, Copy, X, Sparkles } from 'lucide-react';
import { safeFetchJson } from '../utils/api';

export default function AtsOptimizerModal({ profile, initialJob, onClose, onProfileUpdated }) {
  const [jobDescription, setJobDescription] = useState(initialJob?.description || '');
  const [targetRole, setTargetRole] = useState(initialJob?.role || initialJob?.title || profile?.targetRoles?.[0] || 'Software Developer');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAddingSkills, setIsAddingSkills] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const runAtsAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = await safeFetchJson('/api/resume/ats-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          targetRole,
          requiredSkills: initialJob?.requiredSkills || []
        })
      });

      if (result.ok && result.data && result.data.success) {
        setAnalysis(result.data.analysis);
      }
    } catch (err) {
      console.error('ATS Analysis Error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    runAtsAnalysis();
  }, [jobDescription, targetRole]);

  const handleAddMissingSkills = async () => {
    if (!analysis || !analysis.missingKeywords || analysis.missingKeywords.length === 0) return;
    setIsAddingSkills(true);

    try {
      const result = await safeFetchJson('/api/profile/add-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: analysis.missingKeywords })
      });

      if (result.ok && result.data && result.data.success) {
        if (onProfileUpdated) onProfileUpdated(result.data.profile);
        runAtsAnalysis();
      }
    } catch (err) {
      alert('Failed to add skills: ' + err.message);
    } finally {
      setIsAddingSkills(false);
    }
  };

  const handleCopyBulletPoint = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const score = analysis?.atsScore || 70;
  const isHighMatch = score >= 80;

  const handleDownloadTailoredResume = async () => {
    try {
      const result = await safeFetchJson('/api/resume/generate-job-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: initialJob?.jobId || initialJob?._id,
          company: initialJob?.company || 'Employer',
          role: targetRole,
          description: jobDescription,
          requiredSkills: initialJob?.requiredSkills || []
        })
      });

      if (result.ok && result.data && result.data.downloadUrl) {
        const link = document.createElement('a');
        link.href = result.data.downloadUrl;
        link.download = result.data.filename || 'Resume_80ATS_Tailored.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert('Failed to generate tailored resume: ' + (result.data?.error || result.error));
      }
    } catch (err) {
      alert('Error generating tailored resume: ' + err.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={24} color="var(--accent-primary)" />
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>ATS Resume Score & 80%+ Booster</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Targeting job: <strong style={{ color: 'var(--accent-primary)' }}>{targetRole}</strong> {initialJob?.company ? `at ${initialJob.company}` : ''}
              </span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ATS Score Gauge Card */}
        <div style={{
          background: isHighMatch ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          border: `1px solid ${isHighMatch ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                Current ATS Resume Match Score
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 900, color: isHighMatch ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                  {score}%
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isHighMatch ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                  {isHighMatch ? '🎯 Ready! Matches > 80% Target' : '⚠️ Needs Boost to reach 80%+ Target'}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Target size={14} /> Target: 80%+
              </span>
            </div>
          </div>

          {/* Meter Bar */}
          <div style={{ width: '100%', height: '10px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{
              width: `${score}%`,
              height: '100%',
              background: isHighMatch
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>

        {/* Missing Keywords & Auto-Boost Section */}
        {analysis?.missingKeywords && analysis.missingKeywords.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} color="var(--accent-rose)" />
                <strong style={{ fontSize: '0.95rem' }}>Missing Keywords in Resume ({analysis.missingKeywords.length})</strong>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleAddMissingSkills}
                disabled={isAddingSkills}
                style={{ fontSize: '0.8rem' }}
              >
                <Zap size={14} />
                <span>{isAddingSkills ? 'Boosting Profile...' : '⚡ 1-Click Add All Missing Keywords to Profile (Boost to 80%+)'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {analysis.missingKeywords.map((kw, i) => (
                <span key={i} style={{
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: 'var(--accent-rose)',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}>
                  + {kw.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Matched Keywords Section */}
        {analysis?.matchedKeywords && analysis.matchedKeywords.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
              <CheckCircle size={16} color="var(--accent-emerald)" />
              <span>Matched ATS Keywords Found in Your Profile ({analysis.matchedKeywords.length})</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {analysis.matchedKeywords.map((kw, i) => (
                <span key={i} style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: 'var(--accent-emerald)',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}>
                  ✓ {kw.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Optimized Bullet Points Generator */}
        {analysis?.optimizedBulletPoints && analysis.optimizedBulletPoints.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Sparkles size={18} color="var(--accent-primary)" />
              <strong style={{ fontSize: '0.95rem' }}>Tailored ATS Resume Bullet Points (Copy to your Resume)</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {analysis.optimizedBulletPoints.map((point, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justify: 'space-between',
                  gap: '12px',
                  background: 'var(--bg-surface-elevated, rgba(255,255,255,0.03))',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ lineHeight: '1.4' }}>• {point}</div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    style={{ shrink: 0, fontSize: '0.75rem', padding: '4px 8px' }}
                    onClick={() => handleCopyBulletPoint(point, idx)}
                  >
                    <Copy size={12} />
                    <span>{copiedIndex === idx ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Job Description Analyzer Input */}
        <div style={{ marginTop: '16px' }}>
          <label className="form-label" style={{ fontWeight: 600 }}>Test Against Any Custom Job Description</label>
          <textarea 
            className="input-text"
            rows="3"
            placeholder="Paste any job description or requirements here to calculate instant ATS Score..."
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
          <button 
            className="btn btn-primary"
            onClick={handleDownloadTailoredResume}
            style={{ fontSize: '0.875rem' }}
          >
            📄 Download 80%+ ATS Tailored Resume File (.TXT)
          </button>

          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
