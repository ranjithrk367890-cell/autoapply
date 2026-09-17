# AutoApply — Full-Stack Automatic Job Application System

AutoApply is a full-stack personal automation platform designed to discover and automatically apply to relevant job openings across **LinkedIn**, **Naukri**, **Indeed**, and **Company Career Portals**.

Built with **React.js (Vite)**, **Node.js (Express)**, **MongoDB (Mongoose)**, **Playwright**, and **Server-Sent Events (SSE)**.

---

## Key Features

- 📄 **Resume Parser & Verification**: Upload PDF/DOCX/TXT resumes to auto-extract skills, experience, email, and phone (with explicit null handling and manual UI input fallback).
- 🎯 **Role & Location Targeting**: Target roles like *MERN Stack Developer*, *Full Stack Developer*, *Frontend Developer*, *Backend Developer*, and location filters (*Chennai, Bangalore, Remote, etc.*).
- 🔍 **Real-Time Job Discovery**: Parallel Playwright scraping across platforms, filtering jobs posted within the **last 7 days**, canonical deduplication, and 4-tier match scoring (35% role, 30% skills, 20% experience, 15% location).
- ⚡ **Real-Time SSE Streaming**: Live progress streamed directly to the frontend via Server-Sent Events without waiting for full search completion.
- 🤖 **Persistent Playwright Worker**: Saves browser context to `.browser-data` so login sessions (LinkedIn, Naukri, Indeed) persist across application restarts.
- 🧠 **Permanent Answer Bank**: Detects custom job application questions, prompts you once in the UI, and permanently saves your answers in MongoDB for automatic future reuse.
- 🛡️ **Safe Dry-Run TEST_MODE**: Controlled by `.env` (`TEST_MODE=true`), populating all form fields while safely halting prior to final submission.
- 📊 **Live Glassmorphic Dark Dashboard**: Real-time stats, worker controls (Start / Pause / Resume / Stop), and interactive application tables.

---

## Stack & Prerequisites

- **Frontend**: React 18, Vite, Lucide Icons, Vanilla Dark Theme CSS
- **Backend**: Node.js, Express.js, Multer, `pdf-parse`
- **Database**: MongoDB (v6.0+ local or MongoDB Atlas Cloud)
- **Browser Engine**: Playwright Chromium (persistent context)
- **Node.js**: v18.0.0 or higher

---

## Quick Setup Instructions

### 1. Install Dependencies
Run the master installer from the project root to install all dependencies for root, backend, and frontend:
```bash
npm run install:all
```

### 2. Install Playwright Browsers
Install the Playwright browser binaries:
```bash
npx playwright install chromium
```

### 3. Environment Configuration
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/autoapply
MAX_CONCURRENT_APPLICATIONS=5
TEST_MODE=true
TIKBIG_API_URL=https://api.tikbig.com
TIKBIG_API_KEY=your_optional_api_key_here
```

> [!NOTE]
> MongoDB should be running locally (`mongodb://127.0.0.1:27017`) or point `MONGODB_URI` to your MongoDB Atlas connection string.

---

## First-Time Platform Authentication & Existing Chrome Session Setup (CDP)

AutoApply can attach directly to your existing Google Chrome browser session via **Chrome DevTools Protocol (CDP)** so it uses your already open, logged-in tabs (**LinkedIn**, **Naukri**, **Indeed**):

### 1. Launch Chrome in Debug Mode
Close all existing Chrome windows, then open a Command Prompt / Terminal and launch Chrome with remote debugging enabled:

- **Windows (Command Prompt / PowerShell)**:
  ```bash
  chrome.exe --remote-debugging-port=9222
  ```
- **macOS (Terminal)**:
  ```bash
  open -a "Google Chrome" --args --remote-debugging-port=9222
  ```

### 2. Log into Job Platforms
In the opened Chrome window:
1. Log into your **LinkedIn**, **Naukri**, and **Indeed** accounts.
2. Keep the Chrome window open.

### 3. Start AutoApply
AutoApply will automatically connect to `http://localhost:9222` over CDP, reusing your logged-in tabs and cookies directly!

> [!NOTE]
> If Chrome is not running in debug mode when you start the app, AutoApply will output a clear console/SSE warning and fall back to standalone persistent browser context in `.browser-data`.


---

## Running the Application

To launch both the Express backend server and the Vite React frontend concurrently with a single command:

```bash
npm run both
```

- **Frontend Dashboard**: `http://localhost:3000`
- **Backend API Server**: `http://localhost:5000`

---

## Application Workflow Guide

1. **Step 1 — Resume Upload**:
   - Drag & drop or choose your resume PDF. The parser will extract your skills and experience level.
   - If contact details are missing, complete the manual warning input box and click **Confirm Contact Information**.

2. **Step 2 — Role & Location Selection**:
   - Select target role (e.g. *MERN Stack Developer*), preferred locations, and source checkboxes.
   - Click **Start Auto Apply Pipeline**.

3. **Step 3 — Job Discovery & Real-Time Streaming**:
   - Jobs are discovered in parallel and streamed live to your metrics grid via SSE.
   - Non-matching or >7-day-old postings are filtered out.

4. **Step 4 — Auto-Apply Execution**:
   - Click **Start Queue** in the Worker Controls.
   - If `TEST_MODE=true` is enabled, the browser fills out forms and stops before the final submit button for safe dry runs.

5. **Step 5 — Answering Custom Questions & Manual Verification**:
   - If a custom question appears (e.g., *"How many years of MERN experience do you have?"*), the status updates to `ANSWER_REQUIRED`. Click **Provide Answer** to submit your response. It will be saved permanently in your Answer Bank.
   - If a CAPTCHA or 2FA wall occurs, the status updates to `MANUAL_REQUIRED`. Open the job link, complete the check in your browser, and click **Resolved** to resume.
