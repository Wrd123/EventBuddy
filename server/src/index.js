const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./db');
const { seedDemoData, DEMO_LOGIN } = require('./seed/demoData');
const { port, demoMode, isProduction } = require('./config');
const realtime = require('./realtime/hub');

const start = async () => {
  const inMemory = await connectDatabase();

  // The shared demo world, with its public password, is for development. A
  // hosted demo gives each visitor a private world instead (POST /api/auth/demo).
  const sharedDemo = (inMemory || demoMode) && !isProduction;
  if (sharedDemo) {
    await seedDemoData();
    if (inMemory) console.log('Using a temporary in-memory database (set MONGODB_URI to use Atlas).');
    console.log(`Demo login: ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
    console.log('Demo friends (same password): alex@, taylor@, jordan@, jamie@, casey@example.com');
  }

  const server = createApp().listen(port, () => {
    console.log(`EventBuddy API listening on http://localhost:${port}`);
  });
  // Real-time pokes share the API's port, at /api/socket
  realtime.attach(server);

  // Close cleanly on Ctrl+C or when the host stops the process
  const shutdown = async () => {
    realtime.close();
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((err) => {
  console.error('Failed to start the server:', err.message);
  process.exit(1);
});
