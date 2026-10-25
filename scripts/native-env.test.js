const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { nativeEnv } = require('./native-env');

describe('nativeEnv', () => {
  it('builds against this Mac when no API is given, and says invites stay local', () => {
    const settings = nativeEnv({});
    assert.equal(settings.apiUrl, 'http://localhost:4000/api');
    assert.equal(settings.publicUrl, 'http://localhost:3000');
    assert.match(settings.warning, /only work on this Mac/);
  });

  it('uses both addresses for a release build', () => {
    const settings = nativeEnv({
      EVENTBUDDY_API_URL: 'https://api.example.com/api',
      EVENTBUDDY_PUBLIC_URL: 'https://app.example.com/'
    });
    assert.deepEqual(settings, { apiUrl: 'https://api.example.com/api', publicUrl: 'https://app.example.com', warning: '' });
  });

  it('refuses a release build without the web address', () => {
    assert.throws(
      () => nativeEnv({ EVENTBUDDY_API_URL: 'https://api.example.com/api' }),
      /EVENTBUDDY_PUBLIC_URL is missing/
    );
  });

  it('refuses addresses that would break invites on other phones', () => {
    assert.throws(
      () => nativeEnv({ EVENTBUDDY_API_URL: 'https://api.example.com/api', EVENTBUDDY_PUBLIC_URL: 'http://app.example.com' }),
      /must start with https/
    );
    assert.throws(
      () => nativeEnv({ EVENTBUDDY_API_URL: 'https://api.example.com/api', EVENTBUDDY_PUBLIC_URL: 'capacitor://localhost' }),
      /must start with https/
    );
    assert.throws(
      () => nativeEnv({ EVENTBUDDY_API_URL: 'http://api.example.com/api', EVENTBUDDY_PUBLIC_URL: 'https://app.example.com' }),
      /EVENTBUDDY_API_URL must start with https/
    );
  });
});
