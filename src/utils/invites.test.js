import { inviteUrl } from './invites';

describe('inviteUrl', () => {
  const original = process.env.REACT_APP_PUBLIC_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.REACT_APP_PUBLIC_URL;
    else process.env.REACT_APP_PUBLIC_URL = original;
  });

  it("uses the page's own address on the web", () => {
    delete process.env.REACT_APP_PUBLIC_URL;
    expect(inviteUrl('abc123')).toBe(`${window.location.origin}/invite/abc123`);
  });

  it('uses the public web address when one is set, as native builds do', () => {
    // Inside the iPhone app the page's own address is capacitor://localhost,
    // which means nothing on a friend's phone
    process.env.REACT_APP_PUBLIC_URL = 'https://eventbuddy.example.com';
    expect(inviteUrl('abc123')).toBe('https://eventbuddy.example.com/invite/abc123');
  });
});
