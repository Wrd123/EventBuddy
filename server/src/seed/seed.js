// `npm run seed`: add the demo account and events to the database in
// MONGODB_URI (e.g. your Atlas cluster). Skips if the demo account exists.
const mongoose = require('mongoose');
const { mongoUri, isProduction } = require('../config');
const { seedDemoData, DEMO_LOGIN } = require('./demoData');

const run = async () => {
  if (isProduction) {
    throw new Error('Refusing to seed demo data in production (the demo password is public).');
  }
  if (!mongoUri) {
    throw new Error('Set MONGODB_URI in server/.env first. (`npm run dev` seeds its in-memory database by itself.)');
  }

  await mongoose.connect(mongoUri);
  await seedDemoData();
  console.log(`Seeded. Demo login: ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});
