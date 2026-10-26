import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { tap, success, warning } from './haptics';

jest.mock('@capacitor/haptics', () => ({
  Haptics: { impact: jest.fn(() => Promise.resolve()), notification: jest.fn(() => Promise.resolve()) },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' }
}));

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('haptics on the web', () => {
  it('does nothing', () => {
    tap();
    success();
    warning();
    expect(Haptics.impact).not.toHaveBeenCalled();
    expect(Haptics.notification).not.toHaveBeenCalled();
  });
});

describe('haptics in the iPhone app', () => {
  beforeEach(() => {
    jest.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  });

  it('plays a light impact, a success and a warning', () => {
    tap();
    success();
    warning();
    expect(Haptics.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    expect(Haptics.notification).toHaveBeenCalledWith({ type: 'WARNING' });
  });

  it('swallows a rejected or thrown plugin call', async () => {
    Haptics.impact.mockRejectedValueOnce(new Error('no taptic engine'));
    Haptics.notification.mockImplementationOnce(() => { throw new Error('not implemented'); });
    expect(() => { tap(); success(); }).not.toThrow();
    await Promise.resolve();
  });
});
