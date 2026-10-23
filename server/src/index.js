const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./db');
const { seedDemoData, DEMO_LOGIN } = require('./seed/demoData');
const { port } = require('./config');

const start = async () => {
  const inMemory = await connectDatabase();

  if (inMemory) {
    await seedDemoData();
    console.log('Using a temporary in-memory database (set MONGODB_URI to use Atlas).');
    console.log(`Demo login: ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
  }

  const server = createApp().listen(port, () => {
    console.log(`EventBuddy API listening on http://localhost:${port}`);
  });

  // Close cleanly on Ctrl+C or when the host stops the process
  const shutdown = async () => {
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
