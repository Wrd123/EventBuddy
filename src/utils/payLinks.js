// Links that open a payment app with the recipient and amount filled in.
// EventBuddy never moves money: these hand off to Venmo, Cash App or PayPal,
// where the payer confirms. Zelle has no link format (it lives inside each
// bank's app), so it's offered as a value to copy instead.
//
// None of these formats are formal public APIs; they're the links each
// service uses for sharing, so check them on real phones after changes.

// 1360 -> "13.60"
const dollars = (cents) => (cents / 100).toFixed(2);

export const isMobileDevice = (userAgent = navigator.userAgent) =>
  /iPhone|iPad|iPod|Android/i.test(userAgent);

// handles: { venmo, cashapp, paypal, zelle } (any may be ''), as saved.
// -> [{ method, label, handle, url }], with { copy: true } instead of a url
//    for Zelle. Ordered by how directly each one pays.
export const payOptions = (handles, amountCents, note, { mobile = isMobileDevice() } = {}) => {
  if (!handles) return [];
  const amount = dollars(amountCents);
  const options = [];

  if (handles.venmo) {
    const user = encodeURIComponent(handles.venmo);
    const memo = encodeURIComponent(note);
    options.push({
      method: 'venmo',
      label: 'Venmo',
      handle: `@${handles.venmo}`,
      // The app scheme fills in everything on a phone; the web page is the
      // fallback where the app isn't installed
      url: mobile
        ? `venmo://paycharge?txn=pay&recipients=${user}&amount=${amount}&note=${memo}`
        : `https://venmo.com/${user}?txn=pay&amount=${amount}&note=${memo}`
    });
  }
  if (handles.cashapp) {
    options.push({
      method: 'cashapp',
      label: 'Cash App',
      handle: `$${handles.cashapp}`,
      url: `https://cash.app/$${encodeURIComponent(handles.cashapp)}/${amount}`
    });
  }
  if (handles.paypal) {
    options.push({
      method: 'paypal',
      label: 'PayPal',
      handle: `paypal.me/${handles.paypal}`,
      url: `https://paypal.me/${encodeURIComponent(handles.paypal)}/${amount}USD`
    });
  }
  if (handles.zelle) {
    options.push({ method: 'zelle', label: 'Zelle', handle: handles.zelle, copy: true });
  }
  return options;
};
