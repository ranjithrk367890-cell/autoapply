console.log('[SERVER] Starting backend...');

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dns = require('dns');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Validate Environment Variables
if (!process.env.MONGODB_URI) {
  console.error('[DB] Connection failed: MONGODB_URI environment variable is missing in .env');
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autoapply';

// Set Custom DNS Servers for reliable MongoDB Atlas SRV resolution
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Disable operation buffering so queries fail fast when DB is disconnected
mongoose.set('bufferCommands', false);

// Global Process Crash Protection (prevents background Playwright/worker errors from killing Express)
process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]:', reason?.message || reason);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api', apiRoutes);

// Root Healthcheck Endpoint
app.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: 'ok',
    server: 'running',
    database: isDbConnected ? 'connected' : 'disconnected'
  });
});

// Structured Global API Error Handler
app.use((err, req, res, next) => {
  console.error('[API ERROR]');
  console.error('Method:', req.method);
  console.error('Route:', req.originalUrl || req.url);
  console.error('Error name:', err.name || 'Error');
  console.error('Error message:', err.message || 'Internal Server Error');
  if (err.stack) {
    console.error('Stack:', err.stack);
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Connect Database Function with Exact Safe Logging
async function connectDB() {
  console.log('[DB] Connecting to MongoDB...');
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4
    });
    console.log('[DB] MongoDB connected');
  } catch (err) {
    console.error(`[DB] Connection failed: ${err.message}`);
  }
}

connectDB();

mongoose.connection.on('connected', () => {
  console.log('[DB] Mongoose event: connected');
});
mongoose.connection.on('error', (err) => {
  console.error('[DB] Mongoose event error:', err.message);
});
mongoose.connection.on('disconnected', () => {
  console.warn('[DB] Mongoose event: disconnected');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Express listening on port ${PORT}`);
});


