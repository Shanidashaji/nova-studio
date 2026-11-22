import { afterEach, describe, expect, it } from 'vitest';
import { audioInputs, deviceName } from './mic';

type Device = Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>;

/** Replaces the browser's device list and microphone permission for one test. */
function stubBrowser(devices: Device[], permission: PermissionState | 'unsupported') {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: () => Promise.resolve(devices) },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: () =>
        permission === 'unsupported'
          ? Promise.reject(new TypeError('microphone is not a valid permission name'))
          : Promise.resolve({ state: permission }),
    },
  });
}

const input = (deviceId: string, label: string): Device => ({
  kind: 'audioinput',
  deviceId,
  label,
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(navigator, 'permissions');
});

describe('deviceName', () => {
  it('drops the alias prefix Chrome adds to the default and communications entries', () => {
    expect(deviceName('Default - Microphone Array (AMD Audio Device)')).toBe(
      'Microphone Array (AMD Audio Device)',
    );
    expect(deviceName('Communications - USB Microphone')).toBe('USB Microphone');
    expect(deviceName('USB Microphone')).toBe('USB Microphone');
  });
});

describe('audioInputs', () => {
  it('reports labelled devices, without counting the alias entries', async () => {
    stubBrowser(
      [
        input('default', 'Default - Microphone Array (AMD Audio Device)'),
        input('communications', 'Communications - Microphone Array (AMD Audio Device)'),
        input('d0', 'Microphone Array (AMD Audio Device)'),
        { kind: 'audiooutput', deviceId: 's0', label: 'Speakers' },
      ],
      'granted',
    );
    expect(await audioInputs()).toEqual({
      count: 1,
      known: true,
      defaultLabel: 'Microphone Array (AMD Audio Device)',
    });
  });

  it('does not conclude anything from the anonymous entry shown before permission', async () => {
    stubBrowser([input('', '')], 'prompt');
    expect(await audioInputs()).toEqual({ count: 1, known: false, defaultLabel: null });
  });

  it('treats an empty list as "no microphone" once permission is granted', async () => {
    // The last microphone was unplugged: Chrome then lists no audio input at all.
    stubBrowser([], 'granted');
    expect(await audioInputs()).toEqual({ count: 0, known: true, defaultLabel: null });
  });

  it('keeps an empty list unknown while permission is not granted or cannot be read', async () => {
    stubBrowser([], 'prompt');
    expect((await audioInputs()).known).toBe(false);
    stubBrowser([], 'denied');
    expect((await audioInputs()).known).toBe(false);
    stubBrowser([], 'unsupported');
    expect((await audioInputs()).known).toBe(false);
  });
});
