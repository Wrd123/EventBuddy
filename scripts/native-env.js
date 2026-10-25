// Builds the web app for the iPhone app (npm run build:ios) with the two
// addresses it can't work out by itself. On the web the app is served from
// its own address, but inside the native app it runs from
// capacitor://localhost, so it has to be told:
//
//   EVENTBUDDY_API_URL     the API it talks to
//   EVENTBUDDY_PUBLIC_URL  the web app that invite links open
//
// The two must be the same deployment: an invite opens on the web app, which
// joins the event through its own API, so a link to a different web app
// leads to an event that doesn't exist there.
const { spawnSync } = require('node:child_process');

const LOCAL_API = 'http://localhost:4000/api';
const LOCAL_WEB = 'http://localhost:3000';

const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);

const checkRelease = (name, url) => {
  if (!url) return `${name} is missing.`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `${name} isn't a valid address: ${url}`;
  }
  if (parsed.protocol !== 'https:') return `${name} must start with https:// (got ${url}).`;
  if (isLocal(url)) return `${name} can't be a local address in a release build.`;
  return '';
};

// env -> { apiUrl, publicUrl, warning }, or throws with what to fix.
// No API address: a local build against this Mac. An API address that isn't
// local: a release build, which needs both addresses, both https.
const nativeEnv = (env) => {
  const apiUrl = env.EVENTBUDDY_API_URL || '';
  const publicUrl = env.EVENTBUDDY_PUBLIC_URL || '';

  if (!apiUrl || isLocal(apiUrl)) {
    return {
      apiUrl: apiUrl || LOCAL_API,
      publicUrl: publicUrl || LOCAL_WEB,
      warning: publicUrl ? '' : `Local build: invite links will open ${LOCAL_WEB}, so they only work on this Mac.`
    };
  }

  const problems = [checkRelease('EVENTBUDDY_API_URL', apiUrl), checkRelease('EVENTBUDDY_PUBLIC_URL', publicUrl)]
    .filter(Boolean);
  if (problems.length > 0) {
    throw new Error(
      `${problems.join('\n')}\nA release build needs both EVENTBUDDY_API_URL and EVENTBUDDY_PUBLIC_URL, ` +
      'the API and web app of the same deployment.'
    );
  }
  return { apiUrl, publicUrl: publicUrl.replace(/\/+$/, ''), warning: '' };
};

const main = () => {
  let settings;
  try {
    settings = nativeEnv(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (settings.warning) console.warn(settings.warning);

  const { status } = spawnSync('npx', ['react-scripts', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, REACT_APP_API_URL: settings.apiUrl, REACT_APP_PUBLIC_URL: settings.publicUrl }
  });
  process.exit(status ?? 1);
};

if (require.main === module) main();

module.exports = { nativeEnv };
