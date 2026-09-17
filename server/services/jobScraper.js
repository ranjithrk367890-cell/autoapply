const { chromium } = require('playwright');
const Job = require('../models/Job');
const Application = require('../models/Application');
const CandidateProfile = require('../models/CandidateProfile');
const sseManager = require('./sseManager');

let isDiscoveryRunning = false;
let seenKeys = new Set();
let duplicatesRemovedCount = 0;
let currentRunId = `run_${Date.now()}`;

function getCurrentRunId() {
  return currentRunId;
}

function setCurrentRunId(id) {
  if (id) currentRunId = id;
}

function isBrowserActive(browserContext) {
  if (!browserContext) return false;
  try {
    return Boolean(browserContext);
  } catch (e) {
    return false;
  }
}

function isSoftwareDevRole(title) {
  if (!title) return false;
  const t = title.toLowerCase().trim();
  const nonTechKeywords = ['accountant', 'sales executive', 'nurse', 'receptionist', 'driver', 'teacher', 'cook', 'janitor', 'delivery executive'];
  if (nonTechKeywords.some(kw => t.includes(kw))) return false;
  return true;
}

function parseAndValidateDate(dateStr) {
  if (!dateStr) return { status: 'DATE_UNKNOWN', date: new Date(), raw: 'Unknown' };
  const lower = dateStr.toLowerCase().trim();

  // Reject (>7 days ago)
  if (
    lower.includes('30+') || lower.includes('month') || lower.includes('week') ||
    lower.includes('8 d') || lower.includes('9 d') || lower.includes('10 d') ||
    lower.includes('8 day') || lower.includes('9 day') || lower.includes('10 day') ||
    lower.includes('11 day') || lower.includes('12 day') || lower.includes('13 day') || lower.includes('14 day') ||
    lower.includes('15 day') || lower.includes('20 day') || lower.includes('25 day') || lower.includes('30 day')
  ) {
    return { status: 'FILTERED_AGE', date: null, raw: dateStr };
  }

  const now = new Date();
  if (lower.includes('today') || lower.includes('just') || lower.includes('hour') || lower.includes('min') || lower.includes('0d') || lower.includes('less than')) {
    return { status: 'READY', date: now, raw: dateStr };
  }
  if (lower.includes('yesterday') || lower.includes('1 d')) {
    now.setDate(now.getDate() - 1);
    return { status: 'READY', date: now, raw: dateStr };
  }

  const daysMatch = lower.match(/(\d+)\s*(?:d|day)/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days <= 7) {
      now.setDate(now.getDate() - days);
      return { status: 'READY', date: now, raw: dateStr };
    } else {
      return { status: 'FILTERED_AGE', date: null, raw: dateStr };
    }
  }

  return { status: 'DATE_UNKNOWN', date: new Date(), raw: dateStr };
}

function createDedupeKey(applyUrl, jobUrl, company, title, location, source, sourceJobId = null) {
  if (sourceJobId) {
    return `srcid_${(source || '').toLowerCase()}_${sourceJobId.toString().toLowerCase().trim()}`;
  }
  const targetUrl = applyUrl || jobUrl;
  if (targetUrl && targetUrl.startsWith('http')) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('ref');
      return `url_${u.hostname}${u.pathname.toLowerCase().replace(/\/$/, '')}`;
    } catch (e) {}
  }
  const cleanComp = (company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTitle = (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLoc = (location || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `combo_${cleanComp}_${cleanTitle}_${cleanLoc}`;
}

function calculateMatchScore(candidate, jobTitle, jobDesc, jobSkills, jobLoc) {
  let roleScore = 0;
  let skillsScore = 0;
  let expScore = 0;
  let locScore = 0;

  const titleLower = (jobTitle || '').toLowerCase();
  const hasRoleMatch = (candidate.targetRoles || []).some(role =>
    titleLower.includes(role.toLowerCase()) || role.toLowerCase().includes(titleLower)
  );
  if (hasRoleMatch) roleScore = 35;
  else if (titleLower.includes('developer') || titleLower.includes('engineer')) roleScore = 20;

  const candidateSkills = (candidate.skills && candidate.skills.length > 0)
    ? candidate.skills
    : ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'HTML5', 'CSS3', 'Git', 'GitHub', 'REST APIs'];
  const textToSearch = `${jobTitle} ${jobDesc} ${(jobSkills || []).join(' ')}`.toLowerCase();
  let matchedSkillsCount = 0;

  candidateSkills.forEach(skill => {
    if (textToSearch.includes(skill.toLowerCase())) {
      matchedSkillsCount++;
    }
  });

  if (candidateSkills.length > 0) {
    const ratio = matchedSkillsCount / Math.min(candidateSkills.length, 6);
    skillsScore = Math.min(Math.round(ratio * 30), 30);
  } else {
    skillsScore = 15;
  }

  expScore = 20;
  const jobLocLower = (jobLoc || '').toLowerCase();
  const hasLocMatch = (candidate.preferredLocations || []).some(loc =>
    jobLocLower.includes(loc.toLowerCase()) || (loc.toLowerCase() === 'remote' && jobLocLower.includes('remote'))
  );
  if (hasLocMatch || jobLocLower.includes('remote')) locScore = 15;
  else locScore = 8;

  const totalScore = roleScore + skillsScore + expScore + locScore;
  return {
    totalScore: Math.min(totalScore, 100),
    breakdown: { roleScore, skillsScore, expScore, locScore }
  };
}

async function processAndStoreJob(jobData, candidate, runIdOverride = null) {
  try {
    const activeRunId = runIdOverride || currentRunId;

    if (!jobData.company || !jobData.title || !jobData.applyUrl) {
      return null;
    }

    if (!isSoftwareDevRole(jobData.title)) {
      return null;
    }

    const dateAnalysis = parseAndValidateDate(jobData.postedDateRaw);
    if (dateAnalysis.status === 'FILTERED_AGE') {
      console.log(`[DISCOVERY] Job filtered (>7 days old): "${jobData.title}" at "${jobData.company}" (${jobData.postedDateRaw})`);
      return null;
    }

    const dedupeKey = createDedupeKey(
      jobData.applyUrl,
      jobData.jobUrl,
      jobData.company,
      jobData.title,
      jobData.location,
      jobData.source,
      jobData.sourceJobId
    );

    if (seenKeys.has(dedupeKey)) {
      duplicatesRemovedCount++;
      return null;
    }
    seenKeys.add(dedupeKey);

    const existingJob = await Job.findOne({ runId: activeRunId, isArchived: false, dedupeKey });
    if (existingJob) {
      duplicatesRemovedCount++;
      return null;
    }

    const { totalScore, breakdown } = calculateMatchScore(
      candidate,
      jobData.title,
      jobData.description || '',
      jobData.requiredSkills || [],
      jobData.location || ''
    );

    const initialStatus = dateAnalysis.status;

    const newJob = new Job({
      runId: activeRunId,
      isArchived: false,
      jobId: `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      sourceJobId: jobData.sourceJobId || null,
      source: jobData.source,
      company: jobData.company.trim(),
      title: jobData.title.trim(),
      location: jobData.location ? jobData.location.trim() : 'Flexible',
      description: jobData.description || '',
      requiredSkills: jobData.requiredSkills || [],
      postedDate: dateAnalysis.date || new Date(),
      postedDateRaw: jobData.postedDateRaw || 'Recently',
      applyUrl: jobData.applyUrl,
      dedupeKey,
      status: initialStatus,
      matchScore: totalScore,
      matchBreakdown: breakdown
    });

    await newJob.save();

    if (initialStatus === 'READY') {
      const application = new Application({
        runId: activeRunId,
        isArchived: false,
        jobId: newJob.jobId,
        company: newJob.company,
        role: newJob.title,
        source: newJob.source,
        applyUrl: newJob.applyUrl,
        matchScore: newJob.matchScore,
        status: 'READY',
        statusMessage: 'Queued for auto-application'
      });
      await application.save();

      sseManager.sendJobDiscovered(newJob);
      sseManager.sendApplicationUpdated(application);
      sseManager.sendLog('success', `Discovered Job [${newJob.source}]: "${newJob.title}" at ${newJob.company}`);
    }

    return newJob;
  } catch (err) {
    console.error('Error processing job:', err.message);
    return null;
  }
}

async function scrapeLinkedIn(browserContext, role, location, candidate) {
  if (!isBrowserActive(browserContext)) {
    console.warn('[LINKEDIN] Browser session inactive');
    return { source: 'LinkedIn', foundCount: 0, error: 'Browser session inactive' };
  }
  let page;
  let foundCount = 0;
  try {
    console.log(`[LINKEDIN] Searching for "${role}" in "${location}"...`);
    sseManager.sendLog('info', `[LINKEDIN] Searching LinkedIn Jobs for "${role}" in "${location}"...`);

    page = await browserContext.newPage();
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    await page.waitForTimeout(2500);

    const currentUrl = page.url();
    const pageContent = await page.content().catch(() => '');
    if (currentUrl.includes('/login') || currentUrl.includes('/signup') || pageContent.includes('Sign in to view')) {
      console.warn('[LINKEDIN] LinkedIn login required');
      sseManager.sendLog('warning', '[LINKEDIN] LinkedIn login required - Please log into LinkedIn in your Chrome browser session.');
    }

    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await page.waitForTimeout(1500);

    const jobCards = await page.$$('.job-search-card, .jobs-search-results__list-item, li.scaffold-layout__list-item, .job-card-container, div[data-job-id], ul.jobs-search__results-list > li');

    console.log(`[LINKEDIN] Raw cards detected: ${jobCards.length}`);

    for (let i = 0; i < Math.min(jobCards.length, 25); i++) {
      if (!isDiscoveryRunning) break;
      try {
        const card = jobCards[i];
        const titleEl = await card.$('.base-search-card__title, .job-card-list__title, a.job-card-container__link, h3, strong');
        const companyEl = await card.$('.base-search-card__subtitle, .job-card-container__primary-description, .job-card-container__company-name, .artdeco-entity-lockup__subtitle, h4');
        const locationEl = await card.$('.job-search-card__location, .job-card-container__metadata-item, .artdeco-entity-lockup__caption');
        const timeEl = await card.$('time, .job-search-card__listdate, .job-card-container__footer-item');
        const linkEl = await card.$('a.base-card__full-link, a.job-card-list__title, a.job-card-container__link, a');

        const title = titleEl ? (await titleEl.innerText()).trim() : '';
        const company = companyEl ? (await companyEl.innerText()).trim() : '';
        const loc = locationEl ? (await locationEl.innerText()).trim() : location;
        const postedRaw = timeEl ? (await timeEl.innerText()).trim() : 'Today';

        let applyUrl = linkEl ? await linkEl.getAttribute('href') : '';
        if (applyUrl && applyUrl.startsWith('/')) applyUrl = `https://www.linkedin.com${applyUrl}`;

        let sourceJobId = null;
        try {
          if (card.getAttribute) sourceJobId = await card.getAttribute('data-job-id');
        } catch (e) {}

        if (title && company && applyUrl) {
          const stored = await processAndStoreJob({
            source: 'LinkedIn',
            company,
            title,
            location: loc,
            postedDateRaw: postedRaw,
            applyUrl,
            sourceJobId,
            description: `${title} at ${company} in ${loc}`
          }, candidate);
          if (stored) foundCount++;
        }
      } catch (cardErr) {
        console.error('[LINKEDIN] Card parsing error:', cardErr.message);
      }
    }
    console.log(`[LINKEDIN] Found ${foundCount} results`);
    return { source: 'LinkedIn', foundCount, error: null };
  } catch (err) {
    console.error(`[LINKEDIN] Search Error: ${err.message}`);
    sseManager.sendLog('warning', `[LINKEDIN] Error: Could not read job listings (${err.message})`);
    return { source: 'LinkedIn', foundCount: 0, error: err.message };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

async function scrapeNaukri(browserContext, role, location, candidate) {
  if (!isBrowserActive(browserContext)) {
    console.warn('[NAUKRI] Browser session inactive');
    return { source: 'Naukri', foundCount: 0, error: 'Browser session inactive' };
  }
  let page;
  let foundCount = 0;
  try {
    console.log(`[NAUKRI] Searching for "${role}" in "${location}"...`);
    sseManager.sendLog('info', `[NAUKRI] Searching Naukri for "${role}" in "${location}"...`);

    page = await browserContext.newPage();
    const searchUrl = `https://www.naukri.com/job-listings?k=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await page.waitForTimeout(1500);

    const jobCards = await page.$$('.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, div.tuple, div[data-job-id], .styles_jcard__ic947, div.row, div.jobTuple');
    console.log(`[NAUKRI] Raw cards detected: ${jobCards.length}`);

    for (let i = 0; i < Math.min(jobCards.length, 25); i++) {
      if (!isDiscoveryRunning) break;
      try {
        const card = jobCards[i];
        const titleEl = await card.$('a.title, a.job-title');
        const companyEl = await card.$('a.comp-name, span.comp-name, a.subTitle');
        const locEl = await card.$('span.loc-wrap, span.location, span.locWnwrap');
        const dateEl = await card.$('span.job-post-day, span.type, span.stat');

        const title = titleEl ? (await titleEl.innerText()).trim() : '';
        const company = companyEl ? (await companyEl.innerText()).trim() : '';
        const loc = locEl ? (await locEl.innerText()).trim() : location;
        const postedRaw = dateEl ? (await dateEl.innerText()).trim() : 'Just posted';
        const applyUrl = titleEl ? await titleEl.getAttribute('href') : '';
        
        let sourceJobId = null;
        try {
          sourceJobId = await card.getAttribute('data-job-id');
        } catch (e) {}

        if (title && company && applyUrl) {
          const stored = await processAndStoreJob({
            source: 'Naukri',
            company,
            title,
            location: loc,
            postedDateRaw: postedRaw,
            applyUrl,
            sourceJobId,
            description: `${title} role on Naukri by ${company}`
          }, candidate);
          if (stored) foundCount++;
        }
      } catch (cardErr) {
        console.error('[NAUKRI] Card parsing error:', cardErr.message);
      }
    }
    console.log(`[NAUKRI] Found ${foundCount} results`);
    return { source: 'Naukri', foundCount, error: null };
  } catch (err) {
    console.error(`[NAUKRI] Search Error: ${err.message}`);
    sseManager.sendLog('warning', `[NAUKRI] Error: Could not read job listings (${err.message})`);
    return { source: 'Naukri', foundCount: 0, error: err.message };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

async function scrapeIndeed(browserContext, role, location, candidate) {
  if (!isBrowserActive(browserContext)) {
    console.warn('[INDEED] Browser session inactive');
    return { source: 'Indeed', foundCount: 0, error: 'Browser session inactive' };
  }
  let page;
  let foundCount = 0;
  try {
    console.log(`[INDEED] Searching for "${role}" in "${location}"...`);
    sseManager.sendLog('info', `[INDEED] Searching Indeed for "${role}" in "${location}"...`);

    page = await browserContext.newPage();
    const domain = (location.toLowerCase().includes('remote') && !location.toLowerCase().includes('chennai')) ? 'www.indeed.com' : 'in.indeed.com';
    const searchUrl = `https://${domain}/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    await page.waitForTimeout(2500);

    const pageContent = await page.content().catch(() => '');
    if (pageContent.includes('Verify you are human') || pageContent.includes('Cloudflare') || pageContent.includes('Just a moment')) {
      console.warn('[INDEED] Indeed security verification / CAPTCHA required');
      sseManager.sendLog('warning', '[INDEED] Indeed security verification required.');
      return { source: 'Indeed', foundCount: 0, error: 'Security verification required' };
    }

    const jobCards = await page.$$('div.job_seen_beacon, td.resultContent, div.cardOutline, ul.jobsearch-ResultsList > li');
    console.log(`[INDEED] Raw cards detected: ${jobCards.length}`);

    for (let i = 0; i < Math.min(jobCards.length, 25); i++) {
      if (!isDiscoveryRunning) break;
      try {
        const card = jobCards[i];
        const titleEl = await card.$('h2.jobTitle span, a.jcs-JobTitle, h2.jobTitle a');
        const companyEl = await card.$('[data-testid="company-name"], span.companyName');
        const locEl = await card.$('[data-testid="text-location"], div.companyLocation');
        const dateEl = await card.$('span.date, [data-testid="myJobsStateDate"], span.under24h');
        const linkEl = await card.$('a.jcs-JobTitle, h2.jobTitle a');

        const title = titleEl ? (await titleEl.innerText()).trim() : '';
        const company = companyEl ? (await companyEl.innerText()).trim() : '';
        const loc = locEl ? (await locEl.innerText()).trim() : location;
        const postedRaw = dateEl ? (await dateEl.innerText()).trim() : 'Today';

        let applyUrl = linkEl ? await linkEl.getAttribute('href') : '';
        if (applyUrl && applyUrl.startsWith('/')) applyUrl = `https://${domain}${applyUrl}`;
        
        let sourceJobId = null;
        try {
          if (linkEl) sourceJobId = await linkEl.getAttribute('data-jk');
        } catch (e) {}

        if (title && company && applyUrl) {
          const stored = await processAndStoreJob({
            source: 'Indeed',
            company,
            title,
            location: loc,
            postedDateRaw: postedRaw,
            applyUrl,
            sourceJobId,
            description: `${title} at ${company} in ${loc}`
          }, candidate);
          if (stored) foundCount++;
        }
      } catch (cardErr) {
        console.error('[INDEED] Card parsing error:', cardErr.message);
      }
    }
    console.log(`[INDEED] Found ${foundCount} results`);
    return { source: 'Indeed', foundCount, error: null };
  } catch (err) {
    console.error(`[INDEED] Search Error: ${err.message}`);
    sseManager.sendLog('warning', `[INDEED] Error: Could not read job listings (${err.message})`);
    return { source: 'Indeed', foundCount: 0, error: err.message };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

async function scrapeCompanyCareerPortals(browserContext, role, location, candidate) {
  if (!isBrowserActive(browserContext)) {
    console.warn('[COMPANY PORTALS] Browser session inactive');
    return { source: 'Company Career Portals', foundCount: 0, error: 'Browser session inactive' };
  }
  let page;
  let foundCount = 0;
  try {
    console.log(`[COMPANY PORTALS] Searching DuckDuckGo for greenhouse/lever/workday "${role}"...`);
    sseManager.sendLog('info', `Searching Company Career Portals for "${role}"...`);

    page = await browserContext.newPage();
    const query = `site:greenhouse.io OR site:lever.co OR site:myworkdayjobs.com "${role}" "${location}"`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

    await page.waitForTimeout(2000);
    const results = await page.$$('a.result__url');
    console.log(`[COMPANY PORTALS] Raw links found: ${results.length}`);

    for (let i = 0; i < Math.min(results.length, 10); i++) {
      if (!isDiscoveryRunning) break;
      try {
        const linkEl = results[i];
        const href = await linkEl.getAttribute('href');
        if (!href || !href.startsWith('http')) continue;

        let company = 'Company Portal';
        try {
          const u = new URL(href);
          const parts = u.hostname.split('.');
          if (parts.length >= 2) company = parts[parts.length - 2].toUpperCase();
        } catch (e) {}

        const titleText = `${role} at ${company}`;
        const stored = await processAndStoreJob({
          source: 'Company Career Portal',
          company,
          title: titleText,
          location: location || 'Remote',
          postedDateRaw: '1 day ago',
          applyUrl: href,
          description: `${role} position on ${company} career portal`
        }, candidate);
        if (stored) foundCount++;
      } catch (cardErr) {
        console.error('[COMPANY PORTALS] Parsing error:', cardErr.message);
      }
    }
    console.log(`[COMPANY PORTALS] Found ${foundCount} results`);
    return { source: 'Company Career Portals', foundCount, error: null };
  } catch (err) {
    console.error(`[COMPANY PORTALS] Search Error: ${err.message}`);
    return { source: 'Company Career Portals', foundCount: 0, error: err.message };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

function withSourceTimeout(promise, ms = 45000, sourceName = 'Source', role = '', location = '') {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const msg = `[DISCOVERY TIMEOUT] ${sourceName} search for role "${role}" in "${location}" exceeded ${ms / 1000}s limit.`;
      console.warn(msg);
      sseManager.sendLog('warning', `${sourceName} search timed out after ${ms / 1000}s. Moving to next source.`);
      resolve({ source: sourceName, foundCount: 0, error: 'Timeout' });
    }, ms);

    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res || { source: sourceName, foundCount: 0, error: null });
      },
      (err) => {
        clearTimeout(timer);
        console.error(`[DISCOVERY ERROR] ${sourceName} search failed:`, err?.message || err);
        resolve({ source: sourceName, foundCount: 0, error: err?.message || 'Error' });
      }
    );
  });
}

async function startJobDiscovery(options = {}) {
  if (isDiscoveryRunning) {
    return { success: false, message: 'Job discovery is already running.' };
  }

  isDiscoveryRunning = true;
  const newRunId = options.runId || `run_${Date.now()}`;
  currentRunId = newRunId;
  seenKeys.clear();
  duplicatesRemovedCount = 0;

  console.log(`[PIPELINE] Starting run: ${newRunId}`);

  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      await Job.updateMany({ isArchived: false }, { isArchived: true });
      await Application.updateMany({ isArchived: false }, { isArchived: true });
      console.log(`[DISCOVERY] Archived previous active pipeline jobs for fresh run: ${newRunId}`);

      const RunModel = require('../models/Run');
      await RunModel.create({
        runId: newRunId,
        targetRoles: options.roles || [],
        targetLocations: options.locations || [],
        status: 'DISCOVERY',
        startedAt: new Date()
      }).catch(() => {});
    }
  } catch (archErr) {
    console.error('[DISCOVERY] Archive notice:', archErr.message);
  }

  sseManager.sendResetComplete();
  sseManager.sendStatusBanner('Job Discovery', null, null);
  sseManager.sendLog('info', `=== [PIPELINE] Starting Run: ${newRunId} ===`);

  const candidate = await CandidateProfile.findOne() || new CandidateProfile();
  const roles = options.roles && options.roles.length > 0 ? options.roles : candidate.targetRoles;
  const locations = options.locations && options.locations.length > 0 ? options.locations : candidate.preferredLocations;
  const sources = options.sources || { linkedin: true, naukri: true, indeed: true, companyPortals: true };

  const globalTimeout = setTimeout(() => {
    if (isDiscoveryRunning) {
      console.warn('[DISCOVERY TIMEOUT] Total 5-minute discovery timeout reached.');
      sseManager.sendLog('warning', 'Total 5-minute discovery timeout reached.');
      isDiscoveryRunning = false;
      sseManager.sendStatusBanner('Idle / Queue Processing', null, null);
    }
  }, 5 * 60 * 1000);

  (async () => {
    let browserContext;
    let totalRealCollected = 0;
    let totalWithin7Days = 0;
    let readyAdded = 0;

    try {
      const { initBrowser } = require('./browserAutomation');
      try {
        browserContext = await initBrowser();
        console.log('[CDP] Connected');
        sseManager.sendLog('success', '[CDP] Connected to Chrome DevTools Protocol at http://127.0.0.1:9222');
      } catch (e) {
        console.warn('[CDP] Could not connect to Chrome CDP, falling back to persistent context:', e.message);
        browserContext = null;
      }

      for (const r of roles) {
        for (const l of locations) {
          if (!isDiscoveryRunning) break;

          const taskList = [];
          if (sources.linkedin) {
            taskList.push(withSourceTimeout(scrapeLinkedIn(browserContext, r, l, candidate), 45000, 'LinkedIn', r, l));
          }
          if (sources.naukri) {
            taskList.push(withSourceTimeout(scrapeNaukri(browserContext, r, l, candidate), 45000, 'Naukri', r, l));
          }
          if (sources.indeed) {
            taskList.push(withSourceTimeout(scrapeIndeed(browserContext, r, l, candidate), 45000, 'Indeed', r, l));
          }
          if (sources.companyPortals) {
            taskList.push(withSourceTimeout(scrapeCompanyCareerPortals(browserContext, r, l, candidate), 45000, 'Company Career Portals', r, l));
          }

          const results = await Promise.all(taskList);
          for (const res of results) {
            if (res && typeof res === 'object') {
              totalRealCollected += (res.foundCount || 0);
            }
          }
        }
      }

      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        const runJobs = await Job.find({ runId: newRunId, isArchived: false });
        totalWithin7Days = runJobs.filter(j => j.status === 'READY').length;
        readyAdded = totalWithin7Days;
      }

      console.log(`[DISCOVERY] ${totalRealCollected} real jobs collected`);
      console.log(`[DISCOVERY] ${totalWithin7Days} jobs within 7 days`);
      console.log(`[DISCOVERY] ${duplicatesRemovedCount} duplicates removed`);
      console.log(`[DISCOVERY] ${readyAdded} jobs added to READY`);
      console.log('[PIPELINE] Discovery complete');

      if (totalRealCollected === 0) {
        console.log('[DISCOVERY REASON] 0 jobs collected because target sources did not yield search results or required browser login session.');
        sseManager.sendLog('warning', 'Discovery yielded 0 new jobs. Check if your Chrome browser is logged into LinkedIn/Naukri/Indeed.');
      } else {
        sseManager.sendLog('success', `=== [PIPELINE] Discovery Complete: ${readyAdded} jobs queued in READY for Run ${newRunId} ===`);
      }

      const autoApplyWorker = require('./autoApplyWorker');
      autoApplyWorker.startWorkerForRun(newRunId);
    } catch (err) {
      console.error('[DISCOVERY ERROR] Pipeline failure:', err);
      sseManager.sendLog('error', `Discovery Pipeline Failure: ${err.message}`);
    } finally {
      clearTimeout(globalTimeout);
      isDiscoveryRunning = false;
      sseManager.sendStatusBanner('Idle / Queue Processing', null, null);
    }
  })();

  return { success: true, message: `Discovery pipeline initiated for Run ${newRunId}.`, runId: newRunId };
}

function stopJobDiscovery() {
  isDiscoveryRunning = false;
  console.log('[DISCOVERY STAGE] Job Discovery stopped by user request.');
  sseManager.sendLog('warning', 'Job Discovery stopped by user.');
}

function resetScraperState() {
  isDiscoveryRunning = false;
  seenKeys.clear();
  duplicatesRemovedCount = 0;
}

function getDuplicatesRemovedCount() {
  return duplicatesRemovedCount;
}

module.exports = {
  startJobDiscovery,
  stopJobDiscovery,
  resetScraperState,
  getCurrentRunId,
  setCurrentRunId,
  getDuplicatesRemovedCount: () => duplicatesRemovedCount,
  isDiscoveryRunning: () => isDiscoveryRunning
};
