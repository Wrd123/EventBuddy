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
const { clientOrigin, trustProxy } = require('./config');

// Builds the Express app without starting it, so tests can call it directly
const createApp = () => {
  const app = express();
  app.set('trust proxy', trustProxy);

  app.use(helmet());
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
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
