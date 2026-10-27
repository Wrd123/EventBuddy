const mongoose = require('mongoose');
const { mongoUri, isProduction, demoMode } = require('./config');

let memoryServer = null;

// Connects to MONGODB_URI (e.g. Atlas). Without one (development, or a
// hosted demo), starts a throwaway in-memory MongoDB instead. Returns true when in-memory, so the
// caller can seed it with demo data.
const connectDatabase = async () => {
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    return false;
  }
  if (isProduction && !demoMode) throw new Error('MONGODB_URI is required in production');

  // Only loaded when needed. The demo data is tiny, so a small cache keeps
  // MongoDB within a free host's 512 MB alongside the API. The API reaches it
  // over a local port, so it skips its /tmp socket file, which sandboxed
  // shells (like the one Claude Code runs tests in) aren't allowed to create.
  const { MongoMemoryServer } = require('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create({
    instance: { args: ['--wiredTigerCacheSizeGB', '0.25', '--nounixsocket'] }
  });
  await mongoose.connect(memoryServer.getUri());
  return true;
};

const disconnectDatabase = async () => {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};

module.exports = { connectDatabase, disconnectDatabase };
