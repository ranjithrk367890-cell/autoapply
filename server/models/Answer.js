const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  normalizedQuestion: { type: String, required: true, unique: true },
  originalQuestion: { type: String, required: true },
  answer: { type: String, required: true },
  timesUsed: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.model('Answer', answerSchema);
