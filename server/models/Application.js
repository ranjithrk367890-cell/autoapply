const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  runId: { type: String, required: true, index: true },
  isArchived: { type: Boolean, default: false, index: true },
  jobId: { type: String, required: true },
  company: { type: String, required: true },
  role: { type: String, required: true },
  source: { type: String, required: true },
  applyUrl: { type: String, required: true },
  matchScore: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['QUEUED', 'READY', 'APPLYING', 'APPLIED', 'UNCONFIRMED', 'ANSWER_REQUIRED', 'MANUAL_REQUIRED', 'FAILED'],
    default: 'READY'
  },
  statusMessage: { type: String, default: '' },
  failureReason: { type: String, default: '' },
  questionPrompt: { type: String, default: '' },
  tailoredResumeUrl: { type: String, default: '' },
  tailoredResumePath: { type: String, default: '' },
  appliedAt: { type: Date }
}, { timestamps: true });

applicationSchema.index({ isArchived: 1, runId: 1, status: 1 });

module.exports = mongoose.model('Application', applicationSchema);

