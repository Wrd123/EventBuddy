import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Small taps from the iPhone's Taptic Engine to confirm things worked. They
// only happen in the native app: on the web there's nothing to buzz, and a
// missing plugin or an unsupported device must never break the flow it
// accompanies. So every call is fire-and-forget and swallows its errors.
const run = (play) => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    Promise.resolve(play()).catch(() => {});
  } catch {
    // The plugin isn't there; nothing to do
  }
};

// A light touch: a toggle flipped, a message sent, a sheet let go
export const tap = () => run(() => Haptics.impact({ style: ImpactStyle.Light }));

// Something saved or went through
export const success = () => run(() => Haptics.notification({ type: NotificationType.Success }));

// Something we undid, or that didn't go through
export const warning = () => run(() => Haptics.notification({ type: NotificationType.Warning }));
