import * as eventService from './eventService';

// The server's own tests cover event rules (validation, creator, access).
// These check the client calls the right endpoints and unwraps responses.
const respond = (status, body) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

const lastRequest = () => {
  const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return { url, ...options };
};

describe('eventService', () => {
  it('getUserEvents returns the events array', async () => {
    global.fetch.mockResolvedValue(respond(200, { events: [{ _id: '1' }] }));

    expect(await eventService.getUserEvents()).toEqual([{ _id: '1' }]);
    expect(lastRequest().url).toBe('/api/events');
  });

  it('getEventById URL-encodes the id and returns the event', async () => {
    global.fetch.mockResolvedValue(respond(200, { event: { _id: 'a/b' } }));

    expect(await eventService.getEventById('a/b')).toEqual({ _id: 'a/b' });
    expect(lastRequest().url).toBe('/api/events/a%2Fb');
  });

  it('createEvent posts the event and returns { event }', async () => {
    global.fetch.mockResolvedValue(respond(201, { event: { _id: '9', name: 'Party' } }));

    const result = await eventService.createEvent({ name: 'Party' });

    expect(result).toEqual({ event: { _id: '9', name: 'Party' } });
    expect(lastRequest()).toMatchObject({ url: '/api/events', method: 'POST', body: '{"name":"Party"}' });
  });

  it('deleteEvent sends DELETE', async () => {
    global.fetch.mockResolvedValue(respond(204));

    await eventService.deleteEvent('9');
    expect(lastRequest()).toMatchObject({ url: '/api/events/9', method: 'DELETE' });
  });
});
