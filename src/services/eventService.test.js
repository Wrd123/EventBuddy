import * as eventService from './eventService';
import * as authService from './authService';

// The mock services wait on setTimeout to simulate network latency.
// Calling the function schedules that timer synchronously, so we can
// flush it immediately with fake timers instead of really waiting.
const run = (call) => {
  const promise = call();
  jest.runAllTimers();
  return promise;
};

const logIn = () => run(() => authService.login({ email: 'user@example.com', password: 'password' }));

const newEvent = {
  name: 'Friendsgiving',
  type: 'outdoor',
  startDate: '2026-11-27',
  endDate: '2026-11-29',
  location: 'Atlanta, GA',
  invitedFriends: ['Alex', 'Taylor']
};

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createEvent', () => {
  it('adds the logged-in user as the first member', async () => {
    const { user } = await logIn();
    const { event } = await run(() => eventService.createEvent(newEvent));

    expect(event.members[0]).toEqual({ _id: user._id, name: user.name, color: '#7c3aed' });
  });

  it('sets createdBy to the logged-in user', async () => {
    const { user } = await logIn();
    const { event } = await run(() => eventService.createEvent(newEvent));

    expect(event.createdBy).toBe(user._id);
  });

  it('adds invited friends after the creator, in order, with unique ids', async () => {
    await logIn();
    const { event } = await run(() => eventService.createEvent(newEvent));

    expect(event.members.map(m => m.name)).toEqual(['John Doe', 'Alex', 'Taylor']);
    const ids = event.members.map(m => m._id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('makes the creator the only member when nobody is invited', async () => {
    await logIn();
    const { event } = await run(() => eventService.createEvent({ ...newEvent, invitedFriends: undefined }));

    expect(event.members).toHaveLength(1);
  });

  it('keeps the submitted fields and starts with an empty schedule', async () => {
    await logIn();
    const { event } = await run(() => eventService.createEvent(newEvent));

    expect(event).toMatchObject({
      name: 'Friendsgiving',
      type: 'outdoor',
      startDate: '2026-11-27',
      endDate: '2026-11-29',
      location: 'Atlanta, GA',
      schedule: []
    });
  });

  it('saves the event so getUserEvents returns it', async () => {
    await logIn();
    const before = await run(() => eventService.getUserEvents());
    const { event } = await run(() => eventService.createEvent(newEvent));
    const after = await run(() => eventService.getUserEvents());

    expect(after).toHaveLength(before.length + 1);
    expect(after).toContainEqual(event);
  });

  it('throws and saves nothing when nobody is logged in', async () => {
    const before = await run(() => eventService.getUserEvents());

    await expect(run(() => eventService.createEvent(newEvent)))
      .rejects.toThrow('You need to be logged in to create an event.');

    const after = await run(() => eventService.getUserEvents());
    expect(after).toHaveLength(before.length);
  });
});
