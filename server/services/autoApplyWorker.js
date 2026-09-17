const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Answer = require('../models/Answer');
const CandidateProfile = require('../models/CandidateProfile');
const { createTailoredResumeFile } = require('./resumeGenerator');
const sseManager = require('./sseManager');

let isWorkerRunning = false;
let isWorkerPaused = false;
let activeBrowserContext = null;
let targetRunId = null;
let currentConfig = {
  maxConcurrency: parseInt(process.env.MAX_CONCURRENT_APPLICATIONS, 10) || 3,
  testMode: process.env.TEST_MODE !== 'false'
};

const BROWSER_DATA_DIR = path.resolve(__dirname, '../../.browser-data');

function getRandomDelay(minMs = 800, maxMs = 3000) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function normalizeQuestionText(qText) {
  return (qText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getSavedAnswer(questionText) {
  const norm = normalizeQuestionText(questionText);
  if (!norm) return null;
  
  // Exact or fuzzy match on Answer collection
  const existing = await Answer.findOne({ normalizedQuestion: norm });
  if (existing) {
    existing.timesUsed += 1;
    await existing.save();
    return existing.answer;
  }

  // Common question pattern fallbacks based on normalized string keywords
  if (norm.includes('experience') || norm.includes('years')) return '1';
  if (norm.includes('notice') || norm.includes('join')) return 'Immediate';
  if (norm.includes('salary') || norm.includes('ctc')) return '450000';
  if (norm.includes('relocate')) return 'Yes';
  if (norm.includes('sponsorship') || norm.includes('visa')) return 'No';

  return null;
}

const { browserAutomation } = require('./browserAutomation');

async function getOrCreateBrowserContext() {
  return await browserAutomation.initBrowser();
}

async function checkConfirmation(page, initialUrl) {
  try {
    const currentUrl = page.url().toLowerCase();
    const content = (await page.content()).toLowerCase();

    const confirmationKeywords = [
      'application submitted',
      'thank you for applying',
      'your application has been received',
      'successfully applied',
      'application complete',
      'thanks for applying',
      'submission received'
    ];

    const hasConfirmText = confirmationKeywords.some(kw => content.includes(kw));
    const hasConfirmUrl = currentUrl.includes('success') || currentUrl.includes('confirmation') || currentUrl.includes('applied');

    if (hasConfirmText || hasConfirmUrl) {
      return 'APPLIED';
    }
    return 'UNCONFIRMED';
  } catch (err) {
    return 'UNCONFIRMED';
  }
}

async function fillGenericFormInputs(page, candidate, application = null) {
  const inputs = await page.$$('input:not([type="hidden"]), select, textarea');
  const nameParts = (candidate.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || candidate.name || '';
  const lastName = nameParts.slice(1).join(' ') || firstName;
  const prefLoc = (candidate.preferredLocations && candidate.preferredLocations[0]) ? candidate.preferredLocations[0] : 'Chennai';

  for (const input of inputs) {
    try {
      const type = (await input.getAttribute('type') || '').toLowerCase();
      const name = (await input.getAttribute('name') || '').toLowerCase();
      const placeholder = (await input.getAttribute('placeholder') || '').toLowerCase();
      const id = (await input.getAttribute('id') || '').toLowerCase();
      const ariaLabel = (await input.getAttribute('aria-label') || '').toLowerCase();
      const label = `${name} ${placeholder} ${id} ${ariaLabel}`;

      if (type === 'file') {
        const fileToAttach = (application?.tailoredResumePath && fs.existsSync(application.tailoredResumePath))
          ? application.tailoredResumePath
          : candidate.resumePath;

        if (fileToAttach && fs.existsSync(fileToAttach)) {
          await input.setInputFiles(fileToAttach);
          sseManager.sendLog('info', `Attached resume file (${path.basename(fileToAttach)}) to application form.`);
        }
        continue;
      }

      if (type === 'radio' || type === 'checkbox') {
        if (label.includes('authorize') || label.includes('sponsorship') || label.includes('immediate') || label.includes('relocate') || label.includes('yes')) {
          await input.check().catch(() => {});
        }
        continue;
      }

      if (label.includes('first') && label.includes('name')) {
        await input.fill(firstName);
      } else if (label.includes('last') && label.includes('name')) {
        await input.fill(lastName);
      } else if ((label.includes('full') && label.includes('name')) || (label.includes('name') && !label.includes('company'))) {
        await input.fill(candidate.name || firstName);
      } else if (label.includes('email')) {
        await input.fill(candidate.email);
      } else if (label.includes('phone') || label.includes('mobile') || label.includes('contact')) {
        await input.fill(candidate.phone);
      } else if (label.includes('github')) {
        await input.fill(candidate.github || '');
      } else if (label.includes('linkedin')) {
        await input.fill(candidate.linkedin || '');
      } else if (label.includes('experience') || label.includes('exp')) {
        await input.fill(String(candidate.experienceYears || 0));
      } else if (label.includes('salary') || label.includes('ctc')) {
        await input.fill(candidate.expectedSalary || '450000');
      } else if (label.includes('notice')) {
        await input.fill(candidate.noticePeriod || 'Immediate');
      } else if (label.includes('city') || label.includes('location')) {
        await input.fill(prefLoc);
      } else if (label.includes('state')) {
        await input.fill('Tamil Nadu');
      } else if (label.includes('country')) {
        await input.fill('India');
      }
    } catch (e) {
      // Ignore individual field errors
    }
  }
}

async function handleLinkedInApplication(page, candidate, job, application) {
  try {
    const easyApplyBtn = await page.waitForSelector('button.jobs-apply-button, .jobs-easy-apply-button', { timeout: 4000 }).catch(() => null);
    
    if (!easyApplyBtn) {
      const appliedBadge = await page.$('.jobs-s-apply__applied-date, .jobs-apply-button--disabled');
      if (appliedBadge) {
        return { status: 'APPLIED', message: 'Already applied previously on LinkedIn.' };
      }
      return { status: 'MANUAL_REQUIRED', message: 'LinkedIn job requires external portal application or login verification.' };
    }

    await easyApplyBtn.click();
    sseManager.sendLog('info', `Opened LinkedIn Easy Apply modal for "${job.title}"`);

    let stepsCount = 0;
    while (stepsCount < 6) {
      stepsCount++;
      await page.waitForTimeout(1000);

      const unhandledQuestionLabel = await page.$('.fb-dash-form-element label, form .jobs-easy-apply-form-section label');
      if (unhandledQuestionLabel) {
        const qText = (await unhandledQuestionLabel.innerText()).trim();
        const savedAnswer = await getSavedAnswer(qText);

        if (!savedAnswer) {
          return {
            status: 'ANSWER_REQUIRED',
            message: `Custom question encountered: "${qText}"`,
            questionPrompt: qText
          };
        }
        
        const assocInput = await page.$('.fb-dash-form-element input[type="text"], .fb-dash-form-element textarea');
        if (assocInput) await assocInput.fill(savedAnswer);
      }

      const nextBtn = await page.$('button[aria-label*="Continue to next step"], button[aria-label*="Review your application"]');
      if (nextBtn) {
        await nextBtn.click();
        continue;
      }

      const submitBtn = await page.$('button[aria-label*="Submit application"]');
      if (submitBtn) {
        if (currentConfig.testMode) {
          sseManager.sendLog('info', `[TEST_MODE] LinkedIn form populated. Stopping before final submit click.`);
          return { status: 'APPLIED', message: '[TEST_MODE] Form completed successfully without final submit click.' };
        }
        await submitBtn.click();
        await page.waitForTimeout(2000);
        return { status: 'APPLIED', message: 'LinkedIn Easy Apply application submitted successfully!' };
      }

      break;
    }

    return { status: 'UNCONFIRMED', message: 'Completed LinkedIn application flow.' };
  } catch (err) {
    return { status: 'FAILED', message: `LinkedIn apply failed: ${err.message}` };
  }
}

async function processSingleApplication(job, candidate) {
  const application = await Application.findOne({ jobId: job.jobId });
  if (!application) return;

  // Strict User Permission & Contact Details Verification
  if (!candidate || !candidate.email || !candidate.phone || !candidate.name) {
    application.status = 'MANUAL_REQUIRED';
    application.statusMessage = 'Permission & Profile Info Required: Please complete your Name, Email, and Phone in Candidate Profile.';
    await application.save();

    job.status = 'MANUAL_REQUIRED';
    await job.save();

    sseManager.sendApplicationUpdated(application);
    sseManager.sendLog('warning', `[Permission Required] Contact details required in Candidate Profile.`);
    return;
  }

  try {
    application.status = 'APPLYING';
    application.statusMessage = `Navigating to ${job.applyUrl}...`;
    await application.save();
    job.status = 'APPLYING';
    await job.save();

    sseManager.sendApplicationUpdated(application);
    sseManager.sendStatusBanner('Applying', job, null);
    sseManager.sendLog('info', `[Applying] Starting application for "${job.title}" at ${job.company}`);

    if (!application.tailoredResumePath || !fs.existsSync(application.tailoredResumePath)) {
      try {
        const tailoredRes = await createTailoredResumeFile(candidate, job);
        application.tailoredResumePath = tailoredRes.filePath;
        application.tailoredResumeUrl = tailoredRes.downloadUrl;
        await application.save();
      } catch (e) {
        console.error('Error creating tailored resume:', e.message);
      }
    }

    let context;
    let page;
    try {
      context = await getOrCreateBrowserContext();
      page = await context.newPage();
    } catch (browserErr) {
      activeBrowserContext = null;
      browserAutomation.resetBrowser();
      try {
        context = await getOrCreateBrowserContext();
        page = await context.newPage();
      } catch (retryErr) {
        throw new Error(`Browser context unavailable: ${retryErr.message}`);
      }
    }

    page.setDefaultTimeout(30000);

    try {
      await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Detect Login / CAPTCHA / 2FA Walls
      const contentText = (await page.content()).toLowerCase();
      const isLoginWall = contentText.includes('sign in') && contentText.includes('password') ||
                          contentText.includes('captcha') || contentText.includes('verify you are human') ||
                          contentText.includes('enter verification code');

      if (isLoginWall && !job.applyUrl.includes('linkedin.com')) {
        application.status = 'MANUAL_REQUIRED';
        application.statusMessage = 'Login, CAPTCHA, or 2FA verification required on page.';
        await application.save();
        job.status = 'MANUAL_REQUIRED';
        await job.save();
        sseManager.sendApplicationUpdated(application);
        sseManager.sendLog('warning', `[MANUAL_REQUIRED] Login / CAPTCHA / 2FA wall detected for "${job.company}". Please handle in browser.`);
        return;
      }

      let result = { status: 'UNCONFIRMED', message: 'Application processing completed.' };

      if (job.source === 'LinkedIn') {
        result = await handleLinkedInApplication(page, candidate, job, application);
      } else {
        await fillGenericFormInputs(page, candidate, application);

        const submitSelector = 'button[type="submit"], input[type="submit"], button:has-text("Apply Now"), button:has-text("Submit Application"), .apply-button';
        const submitBtn = await page.$(submitSelector).catch(() => null);

        if (submitBtn) {
          if (currentConfig.testMode) {
            sseManager.sendLog('info', `[TEST_MODE] Form filled for ${job.company}. Stopping before submit.`);
            result = { status: 'APPLIED', message: '[TEST_MODE] Dry-run form fill complete.' };
          } else {
            await submitBtn.click();
            await page.waitForTimeout(3000);
            const statusSignal = await checkConfirmation(page, job.applyUrl);
            result = { status: statusSignal, message: `Form submitted. Final state: ${statusSignal}` };
          }
        } else {
          result = { status: 'UNCONFIRMED', message: 'Form filled, submit requires verification.' };
        }
      }

      application.status = result.status;
      application.statusMessage = result.message;
      if (result.questionPrompt) application.questionPrompt = result.questionPrompt;
      if (result.status === 'APPLIED') application.appliedAt = new Date();
      await application.save();

      job.status = result.status;
      await job.save();

      sseManager.sendApplicationUpdated(application);
      sseManager.sendLog(
        result.status === 'APPLIED' ? 'success' : (result.status === 'FAILED' ? 'error' : 'warning'),
        `[${result.status}] Application for "${job.title}" at ${job.company}: ${result.message}`
      );
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  } catch (err) {
    console.error(`Error processing job ${job.jobId}:`, err.message);
    application.status = 'FAILED';
    application.failureReason = err.message;
    application.statusMessage = `Failed: ${err.message}`;
    await application.save();

    job.status = 'FAILED';
    await job.save();

    sseManager.sendApplicationUpdated(application);
    sseManager.sendLog('error', `Action Failed [Job ${job.jobId} - ${job.company}]: ${err.message}`);
  }
}

async function runWorkerLoop() {
  if (!isWorkerRunning || isWorkerPaused) return;

  try {
    const candidate = await CandidateProfile.findOne() || new CandidateProfile();
    const { getCurrentRunId } = require('./jobScraper');
    const activeRunId = targetRunId || getCurrentRunId();

    // Atomic claim via findOneAndUpdate for current run (Requirement 16)
    const claimedApp = await Application.findOneAndUpdate(
      { runId: activeRunId, isArchived: false, status: 'READY' },
      { status: 'APPLYING', statusMessage: 'Claimed by worker thread' },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!claimedApp) {
      return;
    }

    const job = await Job.findOne({ jobId: claimedApp.jobId });
    if (job) {
      job.status = 'APPLYING';
      await job.save();
      await processSingleApplication(job, candidate);
    }

    // Worker continues immediately to next READY job without stopping loop!
    if (isWorkerRunning && !isWorkerPaused) {
      const delay = getRandomDelay(500, 2000);
      setTimeout(runWorkerLoop, delay);
    }
  } catch (err) {
    console.error('Worker Loop Error:', err.message);
    sseManager.sendLog('error', `Worker Error: ${err.message}`);
  }
}

let workerIntervalId = null;

function startWorker() {
  isWorkerRunning = true;
  isWorkerPaused = false;
  sseManager.sendLog('info', 'Auto-Apply Worker Started');
  sseManager.sendStatusBanner('Auto-Apply Worker Running', null, null);

  if (!workerIntervalId) {
    workerIntervalId = setInterval(runWorkerLoop, 3000);
  }
  runWorkerLoop();
}

function startWorkerForRun(runId) {
  if (runId) targetRunId = runId;
  startWorker();
}

function pauseWorker() {
  isWorkerPaused = true;
  sseManager.sendLog('warning', 'Auto-Apply Worker Paused');
  sseManager.sendStatusBanner('Worker Paused', null, null);
}

function resumeWorker() {
  isWorkerPaused = false;
  isWorkerRunning = true;
  sseManager.sendLog('info', 'Auto-Apply Worker Resumed');
  sseManager.sendStatusBanner('Auto-Apply Worker Running', null, null);
  runWorkerLoop();
}

async function stopWorker() {
  isWorkerRunning = false;
  isWorkerPaused = false;
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  if (activeBrowserContext) {
    try {
      await activeBrowserContext.close().catch(() => {});
    } catch (e) {}
    activeBrowserContext = null;
  }
  sseManager.sendLog('warning', 'Auto-Apply Worker Stopped');
  sseManager.sendStatusBanner('Worker Stopped', null, null);
}

function setConfig(newConfig) {
  currentConfig = { ...currentConfig, ...newConfig };
  sseManager.sendLog('info', `Worker configuration updated: Concurrency=${currentConfig.maxConcurrency}, TestMode=${currentConfig.testMode}`);
}

function getConfig() {
  return currentConfig;
}

module.exports = {
  startWorker,
  startWorkerForRun,
  pauseWorker,
  resumeWorker,
  stopWorker,
  setConfig,
  getConfig,
  processSingleApplication,
  isWorkerRunning: () => isWorkerRunning,
  isWorkerPaused: () => isWorkerPaused
};

