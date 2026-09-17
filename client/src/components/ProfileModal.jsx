import React, { useState } from 'react';
import { User, Save, X } from 'lucide-react';

export default function ProfileModal({ profile, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: profile?.name || 'Ranjith Kumar R',
    email: profile?.email || 'ranjithkumarraman626@gmail.com',
    phone: profile?.phone || '+91 8056322161',
    status: profile?.status || 'Fresher (0-1 Yrs)',
    github: profile?.github || 'https://github.com',
    linkedin: profile?.linkedin || 'https://linkedin.com',
    noticePeriod: profile?.noticePeriod || 'Immediate',
    expectedSalary: profile?.expectedSalary || '4,50,000 INR',
    skillsStr: (profile?.skills || []).join(', ')
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const skills = formData.skillsStr.split(',').map(s => s.trim()).filter(Boolean);
    onSave({
      ...formData,
      skills
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '650px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <User size={22} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Candidate Profile Settings</h3>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="input-text" name="name" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label className="form-label">Status Level</label>
            <input className="input-text" name="status" value={formData.status} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="input-text" type="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="input-text" name="phone" value={formData.phone} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label className="form-label">GitHub URL</label>
            <input className="input-text" name="github" value={formData.github} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label className="form-label">LinkedIn Profile URL</label>
            <input className="input-text" name="linkedin" value={formData.linkedin} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label className="form-label">Notice Period</label>
            <input className="input-text" name="noticePeriod" value={formData.noticePeriod} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label className="form-label">Expected Salary</label>
            <input className="input-text" name="expectedSalary" value={formData.expectedSalary} onChange={handleChange} />
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Core Tech Skills (Comma Separated)</label>
            <input className="input-text" name="skillsStr" value={formData.skillsStr} onChange={handleChange} />
          </div>

          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Save size={16} />
              <span>Save Candidate Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
