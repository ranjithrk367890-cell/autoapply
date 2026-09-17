import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ResumeUploader from './components/ResumeUploader';
import RoleSelector from './components/RoleSelector';
import DashboardStats from './components/DashboardStats';
import WorkerControls from './components/WorkerControls';
import LiveBanner from './components/LiveBanner';
import ApplicationsTable from './components/ApplicationsTable';
import AnswerModal from './components/AnswerModal';
import ProfileModal from './components/ProfileModal';
import AtsOptimizerModal from './components/AtsOptimizerModal';
import { safeFetchJson } from './utils/api';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [applications, setApplications] = useState([]);
  const [recentLog, setRecentLog] = useState(null);
  const [statusBanner, setStatusBanner] = useState({ stage: 'Idle / Ready' });
  const [workerState, setWorkerState] = useState({ isRunning: false, isPaused: false });
  const [config, setConfig] = useState({ maxConcurrency: 5, testMode: true });
  
  const [isConnected, setIsConnected] = useState(false);
  const [isDiscoveryRunning, setIsDiscoveryRunning] = useState(false);
  const [activeAnswerApp, setActiveAnswerApp] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [atsModalJob, setAtsModalJob] = useState(null);
  const [browserStatus, setBrowserStatus] = useState(null);
  const [dbErrorWarning, setDbErrorWarning] = useState(null);

  const fetchInitialData = async () => {
    try {
      const [profResult, appResult, cfgResult, chromeResult] = await Promise.all([
        safeFetchJson('/api/profile'),
        safeFetchJson('/api/applications'),
        safeFetchJson('/api/config'),
        safeFetchJson('/api/chrome/status')
      ]);

      if (profResult.ok && profResult.data) {
        setProfile(profResult.data);
      } else if (profResult.error) {
        setDbErrorWarning(profResult.error);
      }

      if (appResult.ok && appResult.data) {
        setApplications(appResult.data.applications || []);
        setStats(appResult.data.stats);
        setDbErrorWarning(null);
      } else if (appResult.error) {
        setDbErrorWarning(appResult.error);
      }

      if (cfgResult.ok && cfgResult.data) {
        setConfig(cfgResult.data);
      }

      if (chromeResult.ok && chromeResult.data) {
        setBrowserStatus({
          ...(chromeResult.data.status || {}),
          cdpAvailable: chromeResult.data.cdpAvailable,
          connected: chromeResult.data.connected
        });
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };


  useEffect(() => {
    fetchInitialData();

    // Setup Server-Sent Events (SSE) Stream
    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.addEventListener('connected', () => setIsConnected(true));

    eventSource.addEventListener('stats_update', (e) => {
      try {
        setStats(JSON.parse(e.data));
      } catch (err) {}
    });

    eventSource.addEventListener('log', (e) => {
      try {
        setRecentLog(JSON.parse(e.data));
      } catch (err) {}
    });

    eventSource.addEventListener('status_banner', (e) => {
      try {
        const bannerData = JSON.parse(e.data);
        setStatusBanner(bannerData);
        if (bannerData.stage === 'Job Discovery') {
          setIsDiscoveryRunning(true);
        } else {
          setIsDiscoveryRunning(false);
        }
      } catch (err) {}
    });

    eventSource.addEventListener('application_updated', (e) => {
      try {
        const updatedApp = JSON.parse(e.data);
        setApplications(prev => {
          const idx = prev.findIndex(a => a.jobId === updatedApp.jobId || a._id === updatedApp._id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = updatedApp;
            return next;
          }
          return [updatedApp, ...prev];
        });
        fetchInitialData();
      } catch (err) {}
    });

    eventSource.addEventListener('job_discovered', () => {
      fetchInitialData();
    });

    eventSource.addEventListener('reset_complete', () => {
      setApplications([]);
      setStats({
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
      });
      fetchInitialData();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const handleResetAllData = async (clearAnswers = false) => {
    const result = await safeFetchJson('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAnswers })
    });

    if (result.ok && result.data && result.data.success) {
      setApplications([]);
      fetchInitialData();
    } else {
      alert(`Notice: ${result.data?.error || result.error || 'Failed to reset data'}`);
    }
  };

  const handleStartDiscovery = async (discoveryOptions) => {

    setIsDiscoveryRunning(true);
    const result = await safeFetchJson('/api/discovery/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discoveryOptions)
    });

    if (!result.ok || (result.data && !result.data.success)) {
      const errorMsg = result.data?.error || result.data?.message || result.error || 'Failed to start job discovery';
      alert(`Notice: ${errorMsg}`);
      setIsDiscoveryRunning(false);
    }
  };

  const handleWorkerAction = async (action) => {
    const result = await safeFetchJson('/api/worker/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    if (result.ok && result.data && result.data.success && result.data.status) {
      setWorkerState(result.data.status);
    } else {
      const errorMsg = result.data?.error || result.error || 'Error updating worker action';
      alert(`Worker Notice: ${errorMsg}`);
    }
  };

  const handleUpdateConfig = async (newCfg) => {
    const result = await safeFetchJson('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCfg)
    });

    if (result.ok && result.data && result.data.success) {
      setConfig(result.data.config);
    } else {
      alert(`Config Error: ${result.error}`);
    }
  };

  const handleSubmitAnswer = async (originalQuestion, answer, jobId) => {
    const result = await safeFetchJson('/api/answers/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalQuestion, answer, jobId })
    });

    if (result.ok && result.data && result.data.success) {
      fetchInitialData();
    } else {
      alert(`Answer Error: ${result.data?.error || result.error}`);
    }
  };

  const handleResolveManual = async (appId) => {
    const result = await safeFetchJson(`/api/applications/${appId}/resolve-manual`, {
      method: 'POST'
    });

    if (result.ok && result.data && result.data.success) {
      fetchInitialData();
    } else {
      alert(`Notice: ${result.data?.error || result.error}`);
    }
  };

  const handleSaveProfile = async (updatedProfile) => {
    const result = await safeFetchJson('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProfile)
    });

    if (result.ok && result.data && result.data.success) {
      setProfile(result.data.profile);
    } else {
      alert(`Save Profile Notice: ${result.data?.error || result.error}`);
    }
  };

  return (
    <div className="app-container">
      <Header 
        isConnected={isConnected} 
        profile={profile} 
        onOpenProfile={() => setIsProfileModalOpen(true)}
        testMode={config?.testMode}
        browserStatus={browserStatus}
        onResetAllData={handleResetAllData}
        isBusy={isDiscoveryRunning || workerState.isRunning}
      />



      {browserStatus && !browserStatus.connected && !browserStatus.cdpAvailable && browserStatus.mode !== 'CDP' && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 20px',
          color: 'var(--accent-amber)',
          fontSize: '0.875rem',
          fontWeight: 600,
          marginTop: '12px'
        }}>
          ⚠️ Chrome remote debugging is not available. Start Chrome with <code>"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222</code> and try again.
        </div>
      )}

      {dbErrorWarning && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 20px',
          color: 'var(--accent-rose)',
          fontSize: '0.875rem',
          fontWeight: 600
        }}>
          ⚠️ Database Status Notice: {dbErrorWarning}. Ensure MongoDB is running locally at <code>mongodb://localhost:27017/autoapply</code>.
        </div>
      )}


      <LiveBanner 
        statusBanner={statusBanner} 
        recentLog={recentLog} 
      />

      <ResumeUploader 
        profile={profile} 
        onProfileUpdated={setProfile}
        onOpenAtsOptimizer={job => setAtsModalJob(job || {})}
      />

      <RoleSelector 
        onStartDiscovery={handleStartDiscovery} 
        isDiscoveryRunning={isDiscoveryRunning} 
      />

      <WorkerControls 
        workerState={workerState} 
        onWorkerAction={handleWorkerAction} 
        config={config} 
        onUpdateConfig={handleUpdateConfig} 
      />

      <DashboardStats 
        stats={stats} 
      />

      <ApplicationsTable 
        applications={applications} 
        onProvideAnswer={app => setActiveAnswerApp(app)} 
        onResolveManual={handleResolveManual}
        onOpenAtsOptimizer={job => setAtsModalJob(job)}
      />

      {activeAnswerApp && (
        <AnswerModal 
          app={activeAnswerApp} 
          onClose={() => setActiveAnswerApp(null)} 
          onSubmitAnswer={handleSubmitAnswer} 
        />
      )}

      {isProfileModalOpen && (
        <ProfileModal 
          profile={profile} 
          onClose={() => setIsProfileModalOpen(false)} 
          onSave={handleSaveProfile} 
        />
      )}

      {atsModalJob !== null && (
        <AtsOptimizerModal 
          profile={profile}
          initialJob={atsModalJob}
          onClose={() => setAtsModalJob(null)}
          onProfileUpdated={setProfile}
        />
      )}
    </div>
  );
}
