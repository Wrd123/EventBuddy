// Serves the production build (build/) the way Render's static site does:
// every page is index.html, and every response carries the headers listed
// in render.yaml. That's how the Content Security Policy gets tried on a
// real build before it ships, since a policy that's wrong breaks the page.
//
//   INLINE_RUNTIME_CHUNK=false REACT_APP_API_URL=http://localhost:4100/api npm run build
//   node scripts/serve-build.js --port 3999 --api http://localhost:4100
//
// --api adds a local API to connect-src, and serving over http drops
// upgrade-insecure-requests, which would otherwise send http://localhost
// calls to https. Everything else is exactly what Render sends.
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const unquote = (value) => value.trim().replace(/^"(.*)"$/, '$1');

// The static site's headers from render.yaml: [{ path, name, value }].
// A small reader for this file's shape, so the check needs no YAML library.
const staticSiteHeaders = (yamlText) => {
  const services = yamlText.split(/\n  - type: /).slice(1);
  const site = services.find((s) => /\n\s+runtime: static\b/.test(`\n${s}`));
  if (!site) return [];
  const block = site.split(/\n    headers:\n/)[1];
  if (!block) return [];
  const headers = [];
  for (const line of block.split('\n')) {
    if (/^ {0,5}\S/.test(line)) break; // the next key of the service
    const entry = line.match(/^\s+(?:- )?(path|name|value):\s*(.*)$/);
    if (!entry) continue;
    if (entry[1] === 'path') headers.push({ path: unquote(entry[2]) });
    else headers[headers.length - 1][entry[1]] = unquote(entry[2]);
  }
  return headers;
};

// "a b; c d" -> { a: ['b'], c: ['d'] }
const parsePolicy = (policy) =>
  Object.fromEntries(
    policy.split(';').map((part) => part.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...sources]) => [name, sources])
  );

const formatPolicy = (directives) =>
  Object.entries(directives).map(([name, sources]) => [name, ...sources].join(' ')).join('; ');

// The policy as served locally: the local API allowed, and no upgrading
// to https on a plain-http server
const forLocal = (policy, api) => {
  const directives = parsePolicy(policy);
  if (api) directives['connect-src'] = [...(directives['connect-src'] || []), api];
  delete directives['upgrade-insecure-requests'];
  return formatPolicy(directives);
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.map': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};

const serve = ({ port, api }) => {
  const buildDir = path.join(ROOT, 'build');
  const headers = staticSiteHeaders(fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8')).map((h) =>
    h.name === 'Content-Security-Policy' ? { ...h, value: forLocal(h.value, api) } : h
  );

  http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.join(buildDir, path.normalize(urlPath));
    // Stay inside build/, and send index.html for app routes like /events/1
    if (!file.startsWith(buildDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(buildDir, 'index.html');
    }
    headers.forEach(({ name, value }) => res.setHeader(name, value));
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => {
    console.log(`Serving build/ with render.yaml's headers on http://localhost:${port}`);
  });
};

if (require.main === module) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  serve({ port: Number(arg('port')) || 3999, api: arg('api') });
}

module.exports = { staticSiteHeaders, parsePolicy, forLocal };
