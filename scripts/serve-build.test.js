// Guards the web page's Content Security Policy in render.yaml. Whether a
// real build runs under it is checked in a browser with serve-build.js;
// these catch the policy being loosened, or the app growing something the
// policy will refuse, before that happens in production.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const { staticSiteHeaders, parsePolicy, forLocal } = require('./serve-build');

const ROOT = path.join(__dirname, '..');
const renderYaml = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
const header = (name) => staticSiteHeaders(renderYaml).find((h) => h.name === name);
const policy = parsePolicy(header('Content-Security-Policy').value);

// Every app source file, without tests
const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'testUtils' ? [] : sourceFiles(full);
    return /\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : [];
  });

describe("the web page's Content Security Policy", () => {
  it('is sent on every page of the static site', () => {
    assert.equal(header('Content-Security-Policy').path, '/*');
  });

  it('runs only the app’s own scripts', () => {
    assert.deepEqual(policy['script-src'], ["'self'"]);
    for (const sources of Object.values(policy)) {
      assert.ok(!sources.includes("'unsafe-inline'"), 'nothing inline');
      assert.ok(!sources.includes("'unsafe-eval'"), 'no eval');
    }
  });

  it('blocks plugins, framing and a rewritten base address', () => {
    assert.deepEqual(policy['object-src'], ["'none'"]);
    assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
    assert.deepEqual(policy['base-uri'], ["'self'"]);
  });

  it('allows what the app loads: fonts, the map and the API', () => {
    assert.ok(policy['style-src'].includes('https://fonts.googleapis.com'));
    assert.ok(policy['font-src'].includes('https://fonts.gstatic.com'));
    assert.ok(policy['connect-src'].includes('https://tiles.openfreemap.org'));
    assert.ok(policy['connect-src'].includes('https://*.onrender.com'));
    assert.ok(policy['worker-src'].includes('blob:'), "MapLibre's workers");
  });

  it('is built without an inline startup script, which it would refuse', () => {
    assert.match(renderYaml, /- key: INLINE_RUNTIME_CHUNK\n\s+value: "false"/);
  });

  it('has nothing in the app it would refuse: inline styles, handlers or scripts in markup', () => {
    const offending = sourceFiles(path.join(ROOT, 'src')).filter((file) =>
      /style="|\son[a-z]+="|<script|dangerouslySetInnerHTML/.test(fs.readFileSync(file, 'utf8'))
    );
    assert.deepEqual(offending.map((f) => path.relative(ROOT, f)), []);
  });

  it('comes with nosniff and a referrer policy', () => {
    assert.equal(header('X-Content-Type-Options').value, 'nosniff');
    assert.equal(header('Referrer-Policy').value, 'strict-origin-when-cross-origin');
  });
});

describe('forLocal', () => {
  it('lets a local build reach a local API over plain http', () => {
    const local = parsePolicy(forLocal(header('Content-Security-Policy').value, 'http://localhost:4000'));

    assert.ok(local['connect-src'].includes('http://localhost:4000'));
    assert.equal(local['upgrade-insecure-requests'], undefined);
    assert.deepEqual(local['script-src'], ["'self'"]);
  });
});
