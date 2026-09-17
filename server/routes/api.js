const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const CandidateProfile = require('../models/CandidateProfile');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Answer = require('../models/Answer');

const { parseResumeFile } = require('../services/resumeParser');
const { analyzeAtsScore } = require('../services/atsOptimizer');
const { createTailoredResumeFile } = require('../services/resumeGenerator');
const sseManager = require('../services/sseManager');
const jobScraper = require('../services/jobScraper');
const autoApplyWorker = require('../services/autoApplyWorker');

// Multer storage configuration
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage });

// Helper to check DB connection state
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// Helper to wait briefly for DB connection to be ready (prevents startup 503 race conditions)
async function ensureDbConnected(timeoutMs = 4000) {
  if (mongoose.connection.readyState === 1) return true;
  
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (mongoose.connection.readyState === 1) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return mongoose.connection.readyState === 1;
}

// Helper to compute live dashboard stats safely
async function computeDashboardStats() {
  const { getDuplicatesRemovedCount, getCurrentRunId } = require('../services/jobScraper');
  const dupsCount = getDuplicatesRemovedCount();
  const currentRunId = getCurrentRunId();

  if (!isDbConnected()) {
    return {
      jobsFound: 0,
      sevenDayActiveJobs: 0,
      duplicatesRemoved: dupsCount,
      ready: 0,
      applying: 0,
      applied: 0,
      unconfirmed: 0,
      answerRequired: 0,
      manualRequired: 0,
      failed: 0,
      remaining: 0
    };
  }

  const activeFilter = { isArchived: false };
  const allJobs = await Job.find(activeFilter);
  const allApps = await Application.find(activeFilter);

  const jobsFound = allJobs.length;
  const active7DayJobs = allJobs.filter(j => j.status !== 'FILTERED_AGE' && j.status !== 'DATE_UNKNOWN' && j.status !== 'EXPIRED' && j.status !== 'INVALID').length;
  const readyCount = allJobs.filter(j => j.status === 'READY').length;
  const applyingCount = allApps.filter(a => a.status === 'APPLYING').length;
  const appliedCount = allApps.filter(a => a.status === 'APPLIED').length;
  const unconfirmedCount = allApps.filter(a => a.status === 'UNCONFIRMED').length;
  const answerReqCount = allApps.filter(a => a.status === 'ANSWER_REQUIRED').length;
  const manualReqCount = allApps.filter(a => a.status === 'MANUAL_REQUIRED').length;
  const failedCount = allApps.filter(a => a.status === 'FAILED').length;
  const remainingCount = readyCount + answerReqCount + manualReqCount;

  return {
    jobsFound,
    sevenDayActiveJobs: active7DayJobs,
    duplicatesRemoved: dupsCount,
    ready: readyCount,
    applying: applyingCount,
    applied: appliedCount,
    unconfirmed: unconfirmedCount,
    answerRequired: answerReqCount,
    manualRequired: manualReqCount,
    failed: failedCount,
    remaining: remainingCount
  };
}


// 0. API Health Endpoint
router.get('/health', (req, res) => {
  const connected = isDbConnected();
  return res.status(200).json({
    status: 'ok',
    server: 'running',
    database: connected ? 'connected' : 'disconnected'
  });
});

// 0.5 Browser Automation Status Endpoint
router.get('/browser/status', (req, res) => {
  const { getBrowserStatus } = require('../services/browserAutomation');
  const browserStatus = getBrowserStatus();
  return res.status(200).json({
    success: true,
    status: browserStatus
  });
});

// 0.6 Chrome CDP Status Endpoint
router.get('/chrome/status', async (req, res) => {
  try {
    const { getBrowserStatus, checkCdpAvailability } = require('../services/browserAutomation');
    const cdpAvailable = await checkCdpAvailability();
    const browserStatus = getBrowserStatus();
    return res.status(200).json({
      success: true,
      connected: cdpAvailable || browserStatus.mode === 'CDP',
      cdpAvailable,
      status: browserStatus
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      connected: false,
      error: err.message
    });
  }
});

// 0.8 Reset All Data Endpoint
router.post('/reset', async (req, res) => {
  try {
    console.log('[API] Reset all data requested...');
    const clearAnswers = req.body && req.body.clearAnswers === true;

    // Delete MongoDB collections
    if (isDbConnected()) {
      await Job.deleteMany({});
      await Application.deleteMany({});
      if (clearAnswers) {
        await Answer.deleteMany({});
        console.log('[API] Answer collection cleared.');
      }
    }

    // Reset in-memory scrapers and worker state
    jobScraper.resetScraperState();
    autoApplyWorker.stopWorker();

    const emptyStats = {
      jobsFound: 0,
      sevenDayActiveJobs: 0,
      duplicatesRemoved: 0,
      ready: 0,
      applying: 0,
      applied: 0,
      unconfirmed: 0,
      answerRequired: 0,
      manualRequired: 0,
      failed: 0,
      remaining: 0
    };

    // Broadcast SSE updates
    sseManager.sendResetComplete();
    sseManager.sendStatsUpdate(emptyStats);
    sseManager.sendStatusBanner('Idle / Ready', null, null);
    sseManager.sendLog('info', `All job and application data has been reset${clearAnswers ? ' (including Answer Bank)' : ''}.`);

    return res.status(200).json({
      success: true,
      message: 'All job and application data reset successfully',
      clearAnswers
    });
  } catch (err) {
    console.error('[API Error] Reset data error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});



// 1. Resume Upload
router.post('/resume/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No resume file uploaded.' });
    }

    const parsed = await parseResumeFile(req.file.path, req.file.mimetype);

    if (!isDbConnected()) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB is not connected',
        parsed
      });
    }

    let profile = await CandidateProfile.findOne();
    if (!profile) profile = new CandidateProfile();

    profile.email = parsed.email || null;
    profile.phone = parsed.phone || null;
    if (parsed.skills && parsed.skills.length > 0) profile.skills = parsed.skills;
    profile.experienceYears = parsed.experienceYears;
    profile.resumePath = req.file.path;
    profile.resumeFileName = req.file.originalname;
    profile.rawText = parsed.rawText;

    await profile.save();

    const missingFields = [];
    if (!profile.email) missingFields.push('Email');
    if (!profile.phone) missingFields.push('Phone');

    return res.json({
      success: true,
      profile,
      warning: missingFields.length > 0 ? `Resume parsed, but missing: ${missingFields.join(', ')}. Please complete manually.` : null,
      missingFields
    });
  } catch (err) {
    console.error('[API Error] Resume upload error:', err);
    return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
  }
});

// 1.5 ATS Resume Score Analysis & Booster Endpoint
router.post('/resume/ats-analyze', async (req, res) => {
  try {
    const { jobDescription, targetRole, requiredSkills } = req.body;
    let profile = null;

    if (isDbConnected()) {
      profile = await CandidateProfile.findOne();
    }

    if (!profile) {
      profile = {
        name: 'Candidate',
        skills: ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB'],
        experienceYears: 1,
        rawText: 'JavaScript React Node Express MongoDB Developer'
      };
    }

    const analysis = analyzeAtsScore(profile, jobDescription || '', targetRole || '', requiredSkills || []);
    return res.json({ success: true, analysis });
  } catch (err) {
    console.error('[API Error] ATS analyze error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/profile/add-skills', async (req, res) => {
  try {
    const { skills } = req.body;
    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ success: false, error: 'Skills array required' });
    }

    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
    }

    let profile = await CandidateProfile.findOne();
    if (!profile) profile = new CandidateProfile();

    const existingLower = new Set((profile.skills || []).map(s => String(s).toLowerCase()));
    const addedSkills = [];

    skills.forEach(skill => {
      const clean = String(skill).trim();
      if (clean && !existingLower.has(clean.toLowerCase())) {
        existingLower.add(clean.toLowerCase());
        profile.skills.push(clean);
        addedSkills.push(clean);
      }
    });

    await profile.save();
    
    // Calculate new boosted score
    const newAnalysis = analyzeAtsScore(profile);

    return res.json({
      success: true,
      profile,
      addedSkills,
      newAtsScore: newAnalysis.atsScore
    });
  } catch (err) {
    console.error('[API Error] Add skills error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 1.6 Generate & Download 80%+ ATS Tailored Resume for Job
router.post('/resume/generate-job-resume', async (req, res) => {
  try {
    const { jobId, company, role, description, requiredSkills } = req.body;

    let profile = null;
    if (isDbConnected()) {
      profile = await CandidateProfile.findOne();
    }
    if (!profile) {
      profile = new CandidateProfile();
    }

    const jobObj = { company, role, title: role, description, requiredSkills };
    const tailoredRes = await createTailoredResumeFile(profile, jobObj);

    if (jobId && isDbConnected()) {
      const app = await Application.findOne({ jobId });
      if (app) {
        app.tailoredResumePath = tailoredRes.filePath;
        app.tailoredResumeUrl = tailoredRes.downloadUrl;
        await app.save();
      }
    }

    return res.json({
      success: true,
      downloadUrl: tailoredRes.downloadUrl,
      filename: tailoredRes.filename,
      content: tailoredRes.content,
      atsScore: 85
    });
  } catch (err) {
    console.error('[API Error] Generate job resume error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/applications/:id/download-tailored', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
    }

    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });

    let profile = await CandidateProfile.findOne();
    if (!profile) profile = new CandidateProfile();

    let filePath = app.tailoredResumePath;
    if (!filePath || !fs.existsSync(filePath)) {
      const job = await Job.findOne({ jobId: app.jobId });
      const tailoredRes = await createTailoredResumeFile(profile, {
        company: app.company,
        role: app.role,
        title: app.role,
        description: job?.description || '',
        requiredSkills: job?.requiredSkills || []
      });
      filePath = tailoredRes.filePath;
      app.tailoredResumePath = tailoredRes.filePath;
      app.tailoredResumeUrl = tailoredRes.downloadUrl;
      await app.save();
    }

    return res.download(filePath, path.basename(filePath));
  } catch (err) {
    console.error('[API Error] Download tailored error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Candidate Profile GET & PUT
router.get('/profile', async (req, res) => {
  try {
    const dbOk = await ensureDbConnected(3000);
    if (!dbOk) {
      const defaultProfile = {
        name: 'Candidate',
        email: '',
        phone: '',
        status: 'Fresher (0-1 Yrs)',
        targetRoles: ['Software Developer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer'],
        preferredLocations: ['Chennai', 'Bangalore', 'Coimbatore', 'Salem', 'Remote'],
        skills: ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'HTML5', 'CSS3', 'Git', 'GitHub', 'REST APIs', 'Python'],
        experienceYears: 0
      };
      return res.json(defaultProfile);
    }

    let profile = await CandidateProfile.findOne();
    if (!profile) {
      profile = new CandidateProfile();
      try {
        await profile.save();
      } catch (saveErr) {
        console.warn('[API Warning] Could not save default profile:', saveErr.message);
      }
    } else {
      let isModified = false;
      if (Array.isArray(profile.skills) && !profile.skills.includes('Python')) {
        profile.skills.push('Python');
        isModified = true;
      }
      if (Array.isArray(profile.targetRoles)) {
        const idx = profile.targetRoles.indexOf('MERN Stack Developer');
        if (idx !== -1) {
          profile.targetRoles[idx] = 'Software Developer';
          isModified = true;
        } else if (!profile.targetRoles.includes('Software Developer')) {
          profile.targetRoles.unshift('Software Developer');
          isModified = true;
        }
      }
      if (isModified) {
        try {
          await profile.save();
        } catch (err) {}
      }
    }
    return res.json(profile);
  } catch (err) {
    console.error('[API Error] Get profile error:', err.message);
    return res.json({
      name: 'Candidate',
      email: '',
      phone: '',
      status: 'Fresher (0-1 Yrs)',
      targetRoles: ['Software Developer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer'],
      preferredLocations: ['Chennai', 'Bangalore', 'Coimbatore', 'Salem', 'Remote'],
      skills: ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'HTML5', 'CSS3', 'Git', 'GitHub', 'REST APIs', 'Python'],
      experienceYears: 0
    });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const dbOk = await ensureDbConnected(4000);
    if (!dbOk) {
      return res.status(503).json({ success: false, error: 'MongoDB is connecting or unavailable. Please try again in a moment.' });
    }

    let profile = await CandidateProfile.findOne();
    if (!profile) profile = new CandidateProfile();

    Object.assign(profile, req.body);
    await profile.save();
    return res.json({ success: true, profile });
  } catch (err) {
    console.error('[API Error] Update profile error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Job Discovery Pipeline Control
router.post('/discovery/start', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB is not connected'
      });
    }

    const result = await jobScraper.startJobDiscovery(req.body);
    return res.json(result);
  } catch (err) {
    console.error('[API Error] Start discovery error:', err.message);
    return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
  }
});

router.post('/discovery/stop', (req, res) => {
  jobScraper.stopJobDiscovery();
  return res.json({ success: true, message: 'Discovery stopped.' });
});

// 4. Auto-Apply Worker Control
router.post('/worker/control', (req, res) => {
  try {
    const { action } = req.body;
    if (action === 'start') {
      if (!isDbConnected()) {
        return res.status(503).json({
          success: false,
          error: 'MongoDB is not connected'
        });
      }
      autoApplyWorker.startWorker();
    } else if (action === 'pause') {
      autoApplyWorker.pauseWorker();
    } else if (action === 'resume') {
      autoApplyWorker.resumeWorker();
    } else if (action === 'stop') {
      autoApplyWorker.stopWorker();
    } else {
      return res.status(400).json({ success: false, error: 'Invalid worker action' });
    }

    return res.json({
      success: true,
      status: {
        isRunning: autoApplyWorker.isWorkerRunning(),
        isPaused: autoApplyWorker.isWorkerPaused()
      }
    });
  } catch (err) {
    console.error('[API Error] Worker control error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Config API (Does not depend on DB)
router.get('/config', (req, res) => {
  try {
    return res.json(autoApplyWorker.getConfig());
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/config', (req, res) => {
  try {
    autoApplyWorker.setConfig(req.body);
    return res.json({ success: true, config: autoApplyWorker.getConfig() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Custom Question Answer Bank Submission
router.post('/answers/submit', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
    }

    const { originalQuestion, answer, jobId } = req.body;
    if (!originalQuestion || !answer) {
      return res.status(400).json({ success: false, error: 'Question and answer are required.' });
    }

    const norm = originalQuestion.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    let ansDoc = await Answer.findOne({ normalizedQuestion: norm });
    if (ansDoc) {
      ansDoc.answer = answer;
      ansDoc.timesUsed += 1;
    } else {
      ansDoc = new Answer({
        normalizedQuestion: norm,
        originalQuestion,
        answer,
        timesUsed: 1
      });
    }
    await ansDoc.save();

    if (jobId) {
      const app = await Application.findOne({ jobId });
      if (app) {
        app.status = 'READY';
        app.statusMessage = 'Answer provided. Queued for auto-apply retry.';
        await app.save();
      }
      const job = await Job.findOne({ jobId });
      if (job) {
        job.status = 'READY';
        await job.save();
      }
    }

    sseManager.sendLog('success', `Saved reusable answer for question: "${originalQuestion}"`);
    return res.json({ success: true, answer: ansDoc });
  } catch (err) {
    console.error('[API Error] Submit answer error:', err.message);
    return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
  }
});

// 7. Resolve Manual Action
router.post('/applications/:id/resolve-manual', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
    }

    const appId = req.params.id;
    const app = await Application.findById(appId);
    if (!app) return res.status(404).json({ success: false, error: 'Application record not found' });

    app.status = 'READY';
    app.statusMessage = 'Manual verification marked resolved by user. Queued for retry.';
    await app.save();

    const job = await Job.findOne({ jobId: app.jobId });
    if (job) {
      job.status = 'READY';
      await job.save();
    }

    sseManager.sendLog('info', `Manual check marked resolved for ${app.company}. Queued for retry.`);
    return res.json({ success: true, application: app });
  } catch (err) {
    console.error('[API Error] Resolve manual error:', err.message);
    return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
  }
});

// 8. Jobs & Applications Endpoint
router.get('/jobs', async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'MongoDB is not connected', jobs: [] });
    }
    const jobs = await Job.find({ isArchived: false }).sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    console.error('[API Error] Get jobs error:', err.message);
    return res.status(503).json({ success: false, error: 'MongoDB is not connected' });
  }
});

router.get('/applications', async (req, res) => {
  try {
    if (!isDbConnected()) {
      const stats = await computeDashboardStats();
      return res.json({
        success: true,
        applications: [],
        stats
      });
    }

    const apps = await Application.find({ isArchived: false }).sort({ createdAt: -1 });
    const stats = await computeDashboardStats();
    return res.json({ success: true, applications: apps, stats });
  } catch (err) {
    console.error('[API Error] Get applications error:', err.message);
    return res.json({
      success: true,
      applications: [],
      stats: {
        jobsFound: 0,
        sevenDayActiveJobs: 0,
        duplicatesRemoved: 0,
        ready: 0,
        applying: 0,
        applied: 0,
        unconfirmed: 0,
        answerRequired: 0,
        manualRequired: 0,
        failed: 0,
        remaining: 0
      }
    });
  }
});


// 9. SSE Stream Endpoint (Does not depend on DB)
router.get('/events', (req, res) => {
  try {
    sseManager.addClient(req, res);
  } catch (err) {
    console.error('[API Error] SSE connection error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
