/**
 * server.js — NoteNexus API server
 */

require('dotenv').config();

// ── Log immediately on process start (visible in Render before any await) ────
console.log(`[${new Date().toISOString()}] NoteNexus starting… NODE_ENV=${process.env.NODE_ENV || 'development'}`);

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const log = require('./utils/logger')('server');

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const connectDB   = require('./config/db');
const setupSocket = require('./socket');

// Ensure WhatsAppConversation model is registered (TTL index applied at startup)
require('./models/WhatsAppConversation');

// Routes
const authRoutes         = require('./routes/auth');
const notesRoutes        = require('./routes/notes');
const whatsappRoutes     = require('./routes/whatsapp');
const examRoutes         = require('./routes/examPredictor');
const plannerRoutes      = require('./routes/studyPlanner');
const reminderRoutes     = require('./routes/reminders');
const tutorRoutes        = require('./routes/tutor');
const searchRoutes       = require('./routes/search');
const revisionRoutes     = require('./routes/revision');
const savedItemsRoutes   = require('./routes/savedItems');
const analyticsRoutes    = require('./routes/analytics');
const copilotRoutes      = require('./routes/copilot');
const gamificationRoutes = require('./routes/gamification');
const roomsRoutes        = require('./routes/rooms');
const demoRoutes         = require('./routes/demo');
const fileVaultRoutes    = require('./routes/filevault');

// Services
const { startReminderCron } = require('./services/reminderService');

const app    = express();
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsOptions = {
  origin:         '*',
  credentials:    false,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Socket.io ─────────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));

// Always use 'dev' format so Render logs stay readable
app.use(morgan('dev'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health / keepalive ────────────────────────────────────────────────────────

app.get('/', (_req, res) =>
  res.json({
    message:   'NoteNexus API running 📚',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
  })
);

app.get('/ping', (_req, res) => res.json({ ok: true, t: Date.now() }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth',         authRoutes);
app.use('/api/notes',        notesRoutes);
app.use('/api/whatsapp',     whatsappRoutes);
app.use('/api/exam',         examRoutes);
app.use('/api/planner',      plannerRoutes);
app.use('/api/reminders',    reminderRoutes);
app.use('/api/tutor',        tutorRoutes);
app.use('/api/search',       searchRoutes);
app.use('/api/revision',     revisionRoutes);
app.use('/api/saved',        savedItemsRoutes);
app.use('/api/analytics',    analyticsRoutes);
app.use('/api/copilot',      copilotRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/rooms',        roomsRoutes);
app.use('/api/demo',         demoRoutes);
app.use('/api/vault',        fileVaultRoutes);

// ── Socket ────────────────────────────────────────────────────────────────────

setupSocket(io);

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  log.error('Unhandled request error', err);
  res.status(err.status ?? 500).json({
    message: err.message ?? 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Self-keepalive (Render free tier) ─────────────────────────────────────────

const cron = require('node-cron');
if (process.env.BACKEND_URL) {
  const pingUrl = `${process.env.BACKEND_URL}/ping`;
  cron.schedule('*/14 * * * *', () => {
    const lib = pingUrl.startsWith('https') ? require('https') : require('http');
    lib.get(pingUrl, (res) => {
      log.info(`[keepalive] self-ping → ${res.statusCode}`);
    }).on('error', (err) => {
      log.warn(`[keepalive] self-ping failed: ${err.message}`);
    });
  });
  log.ok('[keepalive] cron started — pinging every 14 min');
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 5000;

async function startServer() {
  log.info('Connecting to MongoDB…');
  await connectDB();

  log.info('Starting reminder cron…');
  startReminderCron();

  server.listen(PORT, () => {
    log.divider('NoteNexus online');
    log.ok(`Server listening on port ${PORT}`, { env: process.env.NODE_ENV ?? 'development' });
    log.info(`Health check: http://localhost:${PORT}/`);
    log.info(`API base:     http://localhost:${PORT}/api`);
    log.divider();
  });
}

startServer().catch((err) => {
  log.error('Startup failed — process will exit', err);
  process.exit(1);
});
