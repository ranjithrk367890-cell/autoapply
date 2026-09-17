const mongoose = require('mongoose');

const runSchema = new mongoose.Schema({
  runId: { type: String, required: true, unique: true },
  targetRoles: { type: [String], default: [] },
  targetLocations: { type: [String], default: [] },
  status: { 
    type: String, 
    enum: ['CREATED', 'DISCOVERY', 'PROCESSING', 'COMPLETED', 'STOPPED'], 
    default: 'CREATED' 
  },
  jobsDiscovered: { type: Number, default: 0 },
  readyCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Run', runSchema);
