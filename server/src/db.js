const mongoose = require('mongoose');
const { mongoUri, isProduction } = require('./config');

let memoryServer = null;

// Connects to MONGODB_URI (e.g. Atlas). In development without one, starts
// a throwaway in-memory MongoDB instead. Returns true when in-memory, so the
// caller can seed it with demo data.
const connectDatabase = async () => {
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    return false;
  }
  if (isProduction) throw new Error('MONGODB_URI is required in production');

  // Dev-only dependency, so only load it when needed
  const { MongoMemoryServer } = require('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
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
