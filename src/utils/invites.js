// The shareable link for an event's invite code. Uses the page's own address
// on the web; a native build (Capacitor serves from capacitor://localhost)
// must set REACT_APP_PUBLIC_URL to the public web address so links work for
// the people they're sent to.
export const inviteUrl = (code) =>
  `${process.env.REACT_APP_PUBLIC_URL || window.location.origin}/invite/${code}`;
