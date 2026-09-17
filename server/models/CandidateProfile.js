const mongoose = require('mongoose');

const candidateProfileSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  status: { type: String, default: 'Fresher (0-1 Yrs)' },
  targetRoles: { 
    type: [String], 
    default: ['Software Developer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer'] 
  },
  preferredLocations: { 
    type: [String], 
    default: ['Chennai', 'Bangalore', 'Coimbatore', 'Salem', 'Remote'] 
  },
  skills: { type: [String], default: ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'HTML5', 'CSS3', 'Git', 'GitHub', 'REST APIs', 'Python'] },
  experienceYears: { type: Number, default: 0 },
  github: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  noticePeriod: { type: String, default: 'Immediate' },
  expectedSalary: { type: String, default: '4,50,000 INR' },
  resumePath: { type: String, default: '' },
  resumeFileName: { type: String, default: '' },
  rawText: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('CandidateProfile', candidateProfileSchema);
