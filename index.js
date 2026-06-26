import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import compression from 'compression';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

import { initDB, UPLOADS_DIR } from './server/db.js';
import { securityHeaders, globalErrorHandler, requireAuth } from './server/middleware.js';
import { getInstallStatusSnapshot, logInstallStatusSummary } from './server/utils/installStatus.js';
import { revokeActiveSessionsForStartup } from './server/utils/sessionStartup.js';

// Route Imports
import authRoutes from './server/routes/auth.js';
import appRoutes from './server/routes/app.js';
import projectRoutes from './server/routes/projects.js';
import itemRoutes from './server/routes/items.js';
import revisionRoutes from './server/routes/revisions.js';
import chatItemRoutes from './server/routes/chat-items.js';
import chatMemoryRoutes from './server/routes/chat-memory.js';
import chatSessionRoutes from './server/routes/chat-sessions.js';
import adminRoutes from './server/routes/admin.js';
import settingsRoutes from './server/routes/settings.js';
import proxyRoutes from './server/routes/proxy.js';
import errorRoutes from './server/routes/errors.js';
import promptAssistantRoutes from './server/routes/prompt-assistant.js';
import { createExtensionApiRouter } from './server/extensions/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env explicitly from the project root, regardless of CWD.
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3001; 

// --- Middleware Stack ---
app.use(cors());
app.use(compression());

// CRITICAL: Increased limits for Checkpoint Hub "Golden Artifact" commits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(securityHeaders);

// --- API Routes ---
app.use('/api/app', appRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api/proxy', requireAuth, proxyRoutes); // Proxy for AI Enginges
app.use('/api', requireAuth, itemRoutes); 
app.use('/api', requireAuth, revisionRoutes);
app.use('/api', requireAuth, chatItemRoutes);
app.use('/api', requireAuth, chatMemoryRoutes);
app.use('/api', requireAuth, chatSessionRoutes);
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/errors', requireAuth, errorRoutes);
app.use('/api/prompt-assistant', requireAuth, promptAssistantRoutes);
app.use('/api/extensions', requireAuth, createExtensionApiRouter());

// --- Static File Serving ---
app.use('/storage/uploads', express.static(UPLOADS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR)); // Legacy support

// Frontend Build Proxy
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
  const idx = path.join(__dirname, 'dist', 'index.html');
  fs.existsSync(idx) ? res.sendFile(idx) : res.send('AIMANA Backend Active. Frontend build missing.');
});

// CRITICAL: Must be defined after all other middleware/routes
app.use(globalErrorHandler);

const startServer = async () => {
  try {
    // --- Initialize Database ---
    await initDB();
    await revokeActiveSessionsForStartup();
    const installStatus = await getInstallStatusSnapshot();
    logInstallStatusSummary(installStatus);

    const server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`[AIMANA] System Ready`);
        console.log(`[URL] http://127.0.0.1:${PORT}`);
    });
    server.requestTimeout = 0;
    server.setTimeout(0);
  } catch (err) {
    console.error('[AIMANA] Failed to initialize backend:', err);
    process.exit(1);
  }
};

startServer();
