import { newClientId, mightHaveSaved } from './clientId';

describe('newClientId', () => {
  it('makes a different plain id each time', () => {
    const ids = new Set(Array.from({ length: 50 }, newClientId));
    expect(ids.size).toBe(50);
    ids.forEach(id => expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/));
  });

  it('uses crypto.randomUUID where the browser has it', () => {
    const hadCrypto = 'crypto' in global;
    const original = global.crypto;
    try {
      Object.defineProperty(global, 'crypto', { value: { randomUUID: () => 'from-the-browser' }, configurable: true });
      expect(newClientId()).toBe('from-the-browser');
    } finally {
      if (hadCrypto) Object.defineProperty(global, 'crypto', { value: original, configurable: true });
      else delete global.crypto;
    }
  });
});

describe('mightHaveSaved', () => {
  it('is true when the outcome is unknown', () => {
    expect(mightHaveSaved({ status: 0 })).toBe(true);
    expect(mightHaveSaved({ status: 503 })).toBe(true);
  });

  it('is false when the server said no', () => {
    expect(mightHaveSaved({ status: 400 })).toBe(false);
    expect(mightHaveSaved({ status: 409 })).toBe(false);
    expect(mightHaveSaved(undefined)).toBe(false);
  });
});
