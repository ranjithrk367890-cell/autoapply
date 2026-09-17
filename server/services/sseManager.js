let clients = [];

function addClient(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE Stream Connected' })}\n\n`);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
}

function broadcast(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => {
    try {
      res.write(payload);
    } catch (err) {
      console.error('Failed to send SSE to client:', err.message);
    }
  });
}

function sendLog(level, message, metadata = {}) {
  broadcast('log', {
    timestamp: new Date().toISOString(),
    level, // info, success, warning, error
    message,
    metadata
  });
}

function sendJobDiscovered(job) {
  broadcast('job_discovered', job);
}

function sendApplicationUpdated(application) {
  broadcast('application_updated', application);
}

function sendStatsUpdate(stats) {
  broadcast('stats_update', stats);
}

function sendStatusBanner(stage, currentJob = null, lastError = null) {
  broadcast('status_banner', { stage, currentJob, lastError });
}

function sendResetComplete() {
  broadcast('reset_complete', { timestamp: new Date().toISOString(), message: 'Data reset successfully' });
}

module.exports = {
  addClient,
  broadcast,
  sendLog,
  sendJobDiscovered,
  sendApplicationUpdated,
  sendStatsUpdate,
  sendStatusBanner,
  sendResetComplete
};

