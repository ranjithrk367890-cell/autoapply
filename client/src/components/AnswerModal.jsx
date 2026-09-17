import React, { useState } from 'react';
import { HelpCircle, Save, X } from 'lucide-react';

export default function AnswerModal({ app, onClose, onSubmitAnswer }) {
  const [answerText, setAnswerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!app) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!answerText.trim()) return;

    setIsSubmitting(true);
    await onSubmitAnswer(app.questionPrompt || app.statusMessage, answerText, app.jobId);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HelpCircle size={22} color="var(--accent-amber)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Custom Question Required</h3>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Company: <strong>{app.company}</strong> ({app.role})
          </p>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.925rem',
            fontWeight: 600,
            color: 'var(--accent-amber)'
          }}>
            "{app.questionPrompt || 'Please enter your experience level or relevant response for this application.'}"
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Your Response (Saved permanently to Answer Bank for future reuse)</label>
            <textarea
              className="input-textarea"
              rows={3}
              placeholder="e.g. 1 year of experience in MERN stack development, Immediate joiner."
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <Save size={16} />
              <span>{isSubmitting ? 'Saving...' : 'Save Answer & Resume Auto-Apply'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
