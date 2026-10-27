import { apiRequest, setUnauthorizedHandler, ApiError, TOKEN_KEY } from './api';

const respond = (status, body) => ({
  ok: status < 400,
  status,
  json: () => (body === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(body))
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  setUnauthorizedHandler(() => {});
});

const lastRequest = () => {
  const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return { url, ...options };
};

describe('apiRequest', () => {
  it('sends JSON with the login token', async () => {
    localStorage.setItem(TOKEN_KEY, 'abc');
    global.fetch.mockResolvedValue(respond(201, { event: { _id: '1' } }));

    const data = await apiRequest('/events', { method: 'POST', body: { name: 'Party' } });

    expect(data).toEqual({ event: { _id: '1' } });
    const request = lastRequest();
    expect(request.url).toBe('/api/events');
    expect(request.method).toBe('POST');
    expect(request.body).toBe('{"name":"Party"}');
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc'
    });
  });

  it('sends no Authorization header when logged out', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));

    await apiRequest('/auth/login', { method: 'POST', body: {} });

    expect(lastRequest().headers).not.toHaveProperty('Authorization');
  });

  it('returns null for 204 No Content', async () => {
    global.fetch.mockResolvedValue(respond(204));

    expect(await apiRequest('/events/1', { method: 'DELETE' })).toBeNull();
  });

  it("throws the server's message and status on errors", async () => {
    global.fetch.mockResolvedValue(respond(400, { message: 'Please enter an event name.' }));

    const error = await apiRequest('/events', { method: 'POST', body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Please enter an event name.');
    expect(error.status).toBe(400);
  });

  it('uses a generic message when the error has no JSON body', async () => {
    global.fetch.mockResolvedValue(respond(502));

    await expect(apiRequest('/events')).rejects.toThrow('Something went wrong. Please try again.');
  });

  it('reports status 0 when the server cannot be reached', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await apiRequest('/events').catch((e) => e);

    expect(error.status).toBe(0);
    expect(error.message).toBe("Can't reach EventBuddy. Check your connection and try again.");
  });

  it('calls the unauthorized handler when a sent token is rejected', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    localStorage.setItem(TOKEN_KEY, 'expired');
    global.fetch.mockResolvedValue(respond(401, { message: 'Your session has expired.' }));

    await expect(apiRequest('/events')).rejects.toThrow('Your session has expired.');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('leaves a newer login alone when an older one is rejected', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    localStorage.setItem(TOKEN_KEY, 'old');
    let answer;
    global.fetch.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

    const request = apiRequest('/events');
    // Meanwhile the password was changed, or someone else logged in
    localStorage.setItem(TOKEN_KEY, 'new');
    answer(respond(401, { message: 'Your session has expired.' }));

    await expect(request).rejects.toThrow('Your session has expired.');
    expect(handler).not.toHaveBeenCalled();
  });

  describe('while a password change replaces the token', () => {
    // The change is held open; a background read with the old token gets
    // refused meanwhile, as when the change has landed but its answer hasn't
    const raceAChange = async () => {
      const handler = jest.fn();
      setUnauthorizedHandler(handler);
      localStorage.setItem(TOKEN_KEY, 'old');
      let answerChange;
      global.fetch
        .mockReturnValueOnce(new Promise((resolve) => { answerChange = resolve; }))
        .mockResolvedValueOnce(respond(401, { message: 'Your session has expired.' }));

      const change = apiRequest('/auth/password', { method: 'POST', body: {}, replacesToken: true });
      const read = apiRequest('/events');
      return { handler, change, read, answerChange };
    };

    it("doesn't log out when the change works", async () => {
      const { handler, change, read, answerChange } = await raceAChange();

      answerChange(respond(200, { token: 'new', user: {} }));
      await change;
      await expect(read).rejects.toThrow('Your session has expired.');
      expect(handler).not.toHaveBeenCalled();
    });

    it('logs out when the change fails, since the session really ended', async () => {
      const { handler, change, read, answerChange } = await raceAChange();

      answerChange(respond(400, { message: "Your current password isn't right." }));
      await expect(change).rejects.toThrow();
      await expect(read).rejects.toThrow('Your session has expired.');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  it('does not treat a failed login as an expired session', async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    global.fetch.mockResolvedValue(respond(401, { message: 'Invalid email or password' }));

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
