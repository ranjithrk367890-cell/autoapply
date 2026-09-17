const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BROWSER_DATA_DIR = path.resolve(__dirname, '../../.browser-data');

class BrowserAutomation {
  constructor() {
    this.activeBrowserContext = null;
    this.cdpBrowser = null;
    this.connectionMode = 'DISCONNECTED'; // 'CDP' | 'PERSISTENT' | 'DISCONNECTED'
    this.statusMessage = 'Not initialized';
  }

  resetBrowser() {
    if (this.activeBrowserContext) {
      try {
        this.activeBrowserContext.close().catch(() => {});
      } catch (e) {}
      this.activeBrowserContext = null;
    }
    if (this.cdpBrowser) {
      try {
        this.cdpBrowser.close().catch(() => {});
      } catch (e) {}
      this.cdpBrowser = null;
    }
    this.connectionMode = 'DISCONNECTED';
    this.statusMessage = 'Browser reset';
  }

  getBrowserStatus() {
    return {
      mode: this.connectionMode,
      isConnected: Boolean(this.activeBrowserContext),
      message: this.statusMessage
    };
  }

  async checkCdpAvailability() {
    try {
      let resp = await fetch('http://127.0.0.1:9222/json/version').catch(() => null);
      if (!resp || !resp.ok) {
        resp = await fetch('http://localhost:9222/json/version').catch(() => null);
      }
      if (resp && resp.ok) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  async initBrowser() {
    if (!fs.existsSync(BROWSER_DATA_DIR)) {
      fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
    }

    if (this.activeBrowserContext) {
      try {
        const isAlive = this.cdpBrowser ? this.cdpBrowser.isConnected() : Boolean(this.activeBrowserContext);
        if (!isAlive) {
          this.activeBrowserContext = null;
          this.cdpBrowser = null;
        } else {
          return this.activeBrowserContext;
        }
      } catch (e) {
        this.activeBrowserContext = null;
        this.cdpBrowser = null;
      }
    }

    const useExistingChrome = process.env.USE_EXISTING_CHROME !== 'false';

    // 1. Try CDP connection to existing Chrome instance at port 9222 (127.0.0.1)
    if (useExistingChrome) {
      try {
        console.log('[BrowserAutomation] Checking CDP connection at http://127.0.0.1:9222...');
        let cdpUrl = 'http://127.0.0.1:9222';
        const isAvailable = await this.checkCdpAvailability();
        if (!isAvailable) {
          throw new Error('CDP port 9222 unavailable');
        }

        try {
          this.cdpBrowser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        } catch (e) {
          cdpUrl = 'http://localhost:9222';
          this.cdpBrowser = await chromium.connectOverCDP('http://localhost:9222');
        }

        const contexts = this.cdpBrowser.contexts();
        this.activeBrowserContext = contexts.length > 0 ? contexts[0] : await this.cdpBrowser.newContext();
        this.connectionMode = 'CDP';
        this.statusMessage = 'Connected to your existing Chrome session';

        console.log(`[BrowserAutomation] Successfully connected to existing Chrome session via CDP (${cdpUrl})!`);
        try {
          const sseManager = require('./sseManager');
          sseManager.sendLog('success', `Connected to your existing Chrome session via CDP (${cdpUrl}).`);
        } catch (e) {}

        this.cdpBrowser.on('disconnected', () => {
          console.warn('[BrowserAutomation] CDP browser connection lost.');
          this.activeBrowserContext = null;
          this.cdpBrowser = null;
          this.connectionMode = 'DISCONNECTED';
          this.statusMessage = 'Chrome remote debugging is not available. Start Chrome with --remote-debugging-port=9222 and try again.';
        });

        return this.activeBrowserContext;
      } catch (cdpErr) {
        const cdpErrorMsg = "Chrome remote debugging is not available. Start Chrome with --remote-debugging-port=9222 and try again.";
        console.warn(`[BrowserAutomation] ${cdpErrorMsg} (Reason: ${cdpErr.message})`);

        try {
          const sseManager = require('./sseManager');
          sseManager.sendLog('warning', cdpErrorMsg);
        } catch (e) {}

        this.connectionMode = 'CDP_UNAVAILABLE';
        this.statusMessage = cdpErrorMsg;
      }
    }


    // 2. Fallback to launchPersistentContext if CDP was skipped or failed
    console.log('[BrowserAutomation] Falling back to standalone Playwright persistent browser context...');
    const launchOptions = {
      headless: false,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-first-run'
      ]
    };

    try {
      this.activeBrowserContext = await chromium.launchPersistentContext(BROWSER_DATA_DIR, launchOptions);
      this.connectionMode = 'PERSISTENT';
      if (this.statusMessage === 'Not initialized' || this.statusMessage.includes('not available')) {
        this.statusMessage = 'Using standalone Playwright browser context (CDP Unavailable)';
      }

      this.activeBrowserContext.on('close', () => {
        this.activeBrowserContext = null;
        this.connectionMode = 'DISCONNECTED';
      });

      return this.activeBrowserContext;
    } catch (err) {
      console.error('[BrowserAutomation] Failed to launch Playwright browser context:', err.message);
      this.connectionMode = 'DISCONNECTED';
      this.statusMessage = 'Failed to launch browser';
      throw err;
    }
  }
}

const browserAutomation = new BrowserAutomation();

module.exports = {
  browserAutomation,
  BrowserAutomation,
  initBrowser: () => browserAutomation.initBrowser(),
  resetBrowser: () => browserAutomation.resetBrowser(),
  getBrowserStatus: () => browserAutomation.getBrowserStatus(),
  checkCdpAvailability: () => browserAutomation.checkCdpAvailability()
};


