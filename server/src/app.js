const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const inviteRoutes = require('./routes/invites');
const discoverRoutes = require('./routes/discover');
const chatRoutes = require('./routes/chats');
const mapRoutes = require('./routes/map');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const config = require('./config');

const { clientOrigin, demoMode } = config;

// Builds the Express app without starting it, so tests can call it directly.
// Tests can also set the proxy settings, which otherwise come from config,
// and switch the login limit back on (rateLimits), which tests otherwise skip.
const createApp = ({
  trustProxy = config.trustProxy,
  showRequestIp = config.showRequestIp,
  rateLimits = !config.isTest
} = {}) => {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.set('rateLimits', rateLimits);

  app.use(helmet());
  // Answers are about one person (their plans, chats, money, where friends
  // are), so no browser, proxy or CDN may keep a copy to show again
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  // demo: whether the one-tap demo sign-in is available
  app.get('/api/health', (req, res) => res.json({ status: 'ok', demo: demoMode }));
  // Only the caller's own addresses: what reached the API, and which one the
  // current TRUST_PROXY picks as theirs
  if (showRequestIp) {
    app.get('/api/debug/request-ip', (req, res) => res.json({
      ip: req.ip,
      forwardedFor: req.get('X-Forwarded-For') || null,
      connectedFrom: req.socket.remoteAddress,
      trustProxy
    }));
  }
  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/discover', discoverRoutes);
  app.use('/api/chats', chatRoutes);
  app.use('/api/map', mapRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
