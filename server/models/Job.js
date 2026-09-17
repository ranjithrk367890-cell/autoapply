const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  runId: { type: String, required: true, index: true },
  isArchived: { type: Boolean, default: false, index: true },
  jobId: { type: String, required: true },
  sourceJobId: { type: String, default: null },
  source: { type: String, required: true }, // LinkedIn, Naukri, Indeed, Company Career Portal, etc.
  company: { type: String, required: true },
  title: { type: String, required: true },
  location: { type: String, default: 'Flexible / Remote' },
  description: { type: String, default: '' },
  requiredSkills: { type: [String], default: [] },
  experienceLevel: { type: String, default: 'Fresher / 0-1 Yrs' },
  postedDate: { type: Date, default: Date.now },
  postedDateRaw: { type: String, default: 'Recently' },
  applyUrl: { type: String, required: true },
  dedupeKey: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['DISCOVERED', 'QUEUED', 'READY', 'APPLYING', 'APPLIED', 'UNCONFIRMED', 'ANSWER_REQUIRED', 'MANUAL_REQUIRED', 'FAILED', 'DATE_UNKNOWN', 'FILTERED_AGE', 'EXPIRED', 'INVALID'],
    default: 'DISCOVERED'
  },
  matchScore: { type: Number, default: 0 },
  matchBreakdown: {
    roleScore: Number,
    skillsScore: Number,
    expScore: Number,
    locScore: Number
  }
}, { timestamps: true });

jobSchema.index({ runId: 1, dedupeKey: 1 });
jobSchema.index({ isArchived: 1, runId: 1, status: 1 });

module.exports = mongoose.model('Job', jobSchema);

