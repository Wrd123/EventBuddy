import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { installFakeApi, receiveMessage, settle, poke, openSockets, presence, changeEvent, holdNext } from '../../testUtils/fakeApi';
import MainLayout from '../layout/MainLayout';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </MemoryRouter>
  );

// The requests the app made to a path, as [url, options]
const requests = (method, prefix) =>
  global.fetch.mock.calls.filter(([url, opts = {}]) => (opts.method || 'GET') === method && url.startsWith(prefix));

const sendMessage = (text) => {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

// What polling does every few seconds, done now: the app checks for new
// messages whenever it comes back on screen
const checkForNewMessages = () => fireEvent(document, new Event('visibilitychange'));

beforeEach(() => localStorage.clear());

describe('Groups', () => {
  beforeEach(() => installFakeApi().logIn());

  it("lists a chat for each event, with the latest message and what's unread", async () => {
    renderAt('/groups');

    const festival = await screen.findByRole('button', { name: 'Summer Music Festival, 2 unread' });
    expect(festival).toHaveTextContent('Alex: I can grab snacks too.');
    expect(screen.getByRole('button', { name: 'Hiking Trip' })).toHaveTextContent('No messages yet • 1 member');
  });

  it('opens a chat, and reading it clears the unread count', async () => {
    renderAt('/groups');

    fireEvent.click(await screen.findByRole('button', { name: 'Summer Music Festival, 2 unread' }));
    expect(await screen.findByText("Who's bringing a charger?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Summer Music Festival' })).toBeInTheDocument();
  });

  it('shows your own last message as "You"', async () => {
    renderAt('/events/2/chat');
    await screen.findByText('No messages yet');
    sendMessage('Bring boots');
    await screen.findByText('Bring boots');
    await waitFor(() => expect(screen.queryByText('Sending...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    // Opened from the event, so Back goes to the event
    expect(await screen.findByRole('heading', { level: 1, name: 'Hiking Trip' })).toBeInTheDocument();
    await settle();
  });
});

describe('Group chat', () => {
  beforeEach(() => installFakeApi().logIn());

  it('shows the conversation with who said what', async () => {
    renderAt('/events/1/chat');

    expect(await screen.findByText('Has anyone looked at the schedule?')).toBeInTheDocument();
    expect(screen.getByText("I'm going to Tame Impala too.")).toBeInTheDocument();
    expect(screen.getByText('Taylor')).toBeInTheDocument();
    // Alex's two messages this morning share one name label; yesterday's is separate
    expect(screen.getAllByText('Alex')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 1, name: 'Summer Music Festival' })).toBeInTheDocument();
    expect(screen.getByText(/2 members • Event details/)).toBeInTheDocument();
  });

  it('marks the chat read up to the newest message', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    await waitFor(() => expect(requests('PUT', '/api/events/1/messages/read')).toHaveLength(1));
    const [, options] = requests('PUT', '/api/events/1/messages/read')[0];
    expect(JSON.parse(options.body)).toEqual({ lastRead: 'c005' });
  });

  it('sends a message', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('  I have a charger  ');

    expect(await screen.findByText('I have a charger')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('');
    const [, options] = requests('POST', '/api/events/1/messages')[0];
    expect(JSON.parse(options.body)).toEqual({ text: 'I have a charger', clientId: expect.any(String) });
    await waitFor(() => expect(screen.queryByText('Sending...')).not.toBeInTheDocument());
  });

  it("won't send an empty message", async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows new messages from friends without refreshing', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
    checkForNewMessages();

    expect(await screen.findByText('Running 10 minutes late!')).toBeInTheDocument();
    const [url] = requests('GET', '/api/events/1/messages?after=').at(-1);
    expect(url).toBe('/api/events/1/messages?after=c005');
    // And it's read straight away, since the chat is open
    await waitFor(() => expect(requests('PUT', '/api/events/1/messages/read')).toHaveLength(2));
  });

  describe('while scrolled up', () => {
    const reads = () => requests('PUT', '/api/events/1/messages/read').map(([, o]) => JSON.parse(o.body).lastRead);

    // jsdom has no layout, so the log's size and position are set by hand:
    // 1000px of messages in a 400px view
    const scrollTo = (scrollTop) => {
      const log = screen.getByRole('log', { name: 'Messages' });
      Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(log, 'clientHeight', { value: 400, configurable: true });
      log.scrollTop = scrollTop;
      fireEvent.scroll(log);
      return log;
    };

    const openScrolledUp = async () => {
      renderAt('/events/1/chat');
      await screen.findByText('I can grab snacks too.');
      await waitFor(() => expect(reads()).toEqual(['c005']));
      scrollTo(100);
    };

    it("doesn't mark a new message read, and offers to jump to it", async () => {
      await openScrolledUp();

      const late = receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
      checkForNewMessages();
      await screen.findByText('Running 10 minutes late!');
      await settle();

      expect(reads()).toEqual(['c005']);
      const jump = screen.getByRole('button', { name: 'New messages' });
      fireEvent.click(jump);

      const log = screen.getByRole('log', { name: 'Messages' });
      expect(log.scrollTop).toBe(1000);
      // The pill is gone, so focus stays in the conversation
      expect(log).toHaveFocus();
      await waitFor(() => expect(reads()).toEqual(['c005', late._id]));
      expect(screen.queryByRole('button', { name: 'New messages' })).not.toBeInTheDocument();
    });

    it('marks it read once you scroll back down to it', async () => {
      await openScrolledUp();

      const late = receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
      checkForNewMessages();
      await screen.findByText('Running 10 minutes late!');
      scrollTo(560);

      await waitFor(() => expect(reads()).toEqual(['c005', late._id]));
      expect(screen.queryByRole('button', { name: 'New messages' })).not.toBeInTheDocument();
    });

    it('takes you down to a message you send', async () => {
      await openScrolledUp();

      sendMessage('On my way');

      expect(screen.getByRole('log', { name: 'Messages' }).scrollTop).toBe(1000);
      await waitFor(() => expect(screen.queryByText('Sending...')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'New messages' })).not.toBeInTheDocument();
    });

    it("offers to jump when a friend's message arrives just before one of yours", async () => {
      await openScrolledUp();

      receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
      receiveMessage('1', { user: 'u1', name: 'John Doe', text: 'Sent from my other phone' });
      checkForNewMessages();
      await screen.findByText('Sent from my other phone');

      expect(screen.getByRole('button', { name: 'New messages' })).toBeInTheDocument();
      expect(reads()).toEqual(['c005']);
    });

    it('stays unread when the app comes back on screen while scrolled up', async () => {
      await openScrolledUp();
      receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
      checkForNewMessages();
      await screen.findByText('Running 10 minutes late!');

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      fireEvent(document, new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      checkForNewMessages();
      await settle();

      expect(reads()).toEqual(['c005']);
    });
  });

  it('waits until the app is back on screen to mark a message read', async () => {
    const setVisibility = (state) => Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');
    await waitFor(() => expect(requests('PUT', '/api/events/1/messages/read')).toHaveLength(1));

    // A check that set off while on screen lands after the app was put away
    receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
    const release = holdNext('GET', '/events/1/messages');
    checkForNewMessages();
    setVisibility('hidden');
    try {
      await release();
      await screen.findByText('Running 10 minutes late!');
      expect(requests('PUT', '/api/events/1/messages/read')).toHaveLength(1);

      setVisibility('visible');
      checkForNewMessages();
      await waitFor(() => expect(requests('PUT', '/api/events/1/messages/read')).toHaveLength(2));
    } finally {
      setVisibility('visible');
    }
  });

  it('shows a message once even if polling also returns it', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('See you there');
    await waitFor(() => expect(screen.queryByText('Sending...')).not.toBeInTheDocument());
    checkForNewMessages();
    await waitFor(() => expect(requests('GET', '/api/events/1/messages?after=')).toHaveLength(1));

    expect(screen.getAllByText('See you there')).toHaveLength(1);
  });

  it('starts empty for a new group', async () => {
    renderAt('/events/2/chat');
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText('Start planning with everyone going to Hiking Trip.')).toBeInTheDocument();
  });

  it("is hidden from people who aren't in the event", async () => {
    renderAt('/events/3/chat');
    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });
});

describe('Group chat when sending fails', () => {
  beforeEach(() => installFakeApi({ chatSendError: "Couldn't reach the server." }).logIn());

  it('keeps the message so you can retry it', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('Anyone up?');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not sent');

    // The connection comes back
    installFakeApi();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByText('Sending...')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('Anyone up?')).toHaveLength(1);
    expect(requests('POST', '/api/events/1/messages')).toHaveLength(1);
  });

  it('lets you delete a message that failed', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('Never mind');
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByText('Never mind')).not.toBeInTheDocument();
  });
});

describe('Group chat when a response is lost', () => {
  // The server saves the message, but the phone never hears back
  beforeEach(() => installFakeApi({ chatSendsLost: 1 }).logIn());

  const sentIds = () => requests('POST', '/api/events/1/messages').map(([, opts]) => JSON.parse(opts.body).clientId);

  it('retries with the same id, so the message is saved once', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('On my way');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not sent');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getAllByText('On my way')).toHaveLength(1);
    const [first, retry] = sentIds();
    expect(first).toBeTruthy();
    expect(retry).toBe(first);
  });

  it('drops the failed copy once polling shows it was saved', async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('On my way');
    await screen.findByRole('alert');
    checkForNewMessages();

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getAllByText('On my way')).toHaveLength(1);
    expect(sentIds()).toHaveLength(1);
  });

  it('gives each new send its own id, so the same text can be sent twice', async () => {
    installFakeApi().logIn();
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');

    sendMessage('Ha!');
    await waitFor(() => expect(screen.queryByText('Sending...')).not.toBeInTheDocument());
    sendMessage('Ha!');

    await waitFor(() => expect(screen.getAllByText('Ha!')).toHaveLength(2));
    const [first, second] = sentIds();
    expect(first).not.toBe(second);
  });
});

describe('Group chat history', () => {
  it('loads earlier messages on request', async () => {
    const pad = (n) => String(n).padStart(3, '0');
    const history = Array.from({ length: 60 }, (_, i) => ({
      _id: `c${pad(i + 1)}`,
      sender: { user: 'u2', name: 'Alex' },
      text: `Message ${i + 1}`,
      createdAt: new Date(Date.now() - (60 - i) * 60 * 1000).toISOString()
    }));
    installFakeApi({ chats: { '1': history } }).logIn();
    renderAt('/events/1/chat');

    expect(await screen.findByText('Message 60')).toBeInTheDocument();
    expect(screen.queryByText('Message 10')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }));

    expect(await screen.findByText('Message 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });
});

describe('Real time', () => {
  beforeEach(() => installFakeApi({ realtime: true }).logIn());

  it("shows a friend's message as soon as the server says there is one", async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');
    await waitFor(() => expect(openSockets()[0]?.subscriptions.has('1')).toBe(true));

    receiveMessage('1', { user: 'u3', name: 'Taylor', text: 'Running 10 minutes late!' });
    await poke('1', 'chat');

    expect(await screen.findByText('Running 10 minutes late!')).toBeInTheDocument();
  });
});

describe('Here now', () => {
  beforeEach(() => installFakeApi({ realtime: true }).logIn());

  const openChat = async () => {
    renderAt('/events/1/chat');
    await screen.findByText('I can grab snacks too.');
    await waitFor(() => expect(openSockets()[0]?.subscriptions.has('1')).toBe(true));
  };

  it('names the others who have the app open, under the header', async () => {
    await openChat();
    expect(screen.queryByText(/Here now/)).not.toBeInTheDocument();

    await presence('1', ['u1', 'u2']);
    expect(screen.getByText('Here now: Alex')).toBeInTheDocument();

    await presence('1', ['u1']);
    expect(screen.queryByText(/Here now/)).not.toBeInTheDocument();
  });

  it('shows a name with markup in it as plain text', async () => {
    changeEvent('1', (event) => { event.members[1].name = '<img src=x onerror=alert(1)>'; });
    await openChat();

    await presence('1', ['u2']);
    expect(screen.getByText('Here now: <img')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
