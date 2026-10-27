import { changePassword, endSession } from './authService';
import { setUnauthorizedHandler, TOKEN_KEY } from './api';

const respond = (status, body) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  setUnauthorizedHandler(() => {});
});

describe('endSession', () => {
  it('counts a login the server had already ended as done', async () => {
    localStorage.setItem(TOKEN_KEY, 'old');
    global.fetch.mockResolvedValue(respond(401, { message: 'Your session has expired. Please log in again.' }));

    await expect(endSession()).resolves.toBeUndefined();
  });

  it("throws when the server can't be reached", async () => {
    localStorage.setItem(TOKEN_KEY, 'abc');
    global.fetch.mockRejectedValue(new TypeError('offline'));

    await expect(endSession()).rejects.toMatchObject({ status: 0 });
  });
});

describe('changePassword', () => {
  const passwords = { currentPassword: 'old one here', newPassword: 'new one here' };

  it('keeps the new token the server sends for this phone', async () => {
    localStorage.setItem(TOKEN_KEY, 'before');
    global.fetch.mockResolvedValue(respond(200, { token: 'after', user: { name: 'Pat' } }));

    await changePassword(passwords);

    expect(localStorage.getItem(TOKEN_KEY)).toBe('after');
  });

  it("doesn't replace a login that started while it was on its way", async () => {
    localStorage.setItem(TOKEN_KEY, 'pat');
    let answer;
    global.fetch.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

    const changing = changePassword(passwords);
    localStorage.setItem(TOKEN_KEY, 'sam');
    answer(respond(200, { token: 'pat-new', user: { name: 'Pat' } }));
    await changing;

    expect(localStorage.getItem(TOKEN_KEY)).toBe('sam');
  });
});
