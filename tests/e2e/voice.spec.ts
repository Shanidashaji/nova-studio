import { expect, test, type Page } from '@playwright/test';

/**
 * NOVA voice interaction: microphone permission, device detection, speech recognition, sending
 * the transcript to NOVA and speaking the reply.
 *
 * The browser's media, permission, recognition and synthesis APIs are replaced by a scripted fake
 * (installed before the app loads) so each failure the real browser can produce — blocked,
 * dismissed, no device, device busy, OS block, capture failure, disconnect — is reproducible.
 * Everything else (UI, session logic, the NOVA API) is the real application.
 */

type RecSession =
  | { kind: 'result'; text: string; audio?: boolean }
  | { kind: 'error'; error: string; audio?: boolean }
  | { kind: 'hold'; interim?: string } // listens until stop()/abort()
  | { kind: 'silent' }; // never delivers audio (capture silently failed)

interface FakeConfig {
  permission: 'granted' | 'prompt' | 'denied';
  /** getUserMedia outcome: `ok`, or a DOMException name and message. */
  gum: 'ok' | { name: string; message: string };
  /** Permission state after a successful getUserMedia (the user chose Allow). */
  permissionAfterGum?: 'granted';
  gumDelayMs?: number;
  devices: string[];
  recognition: RecSession[];
  recognitionSupported?: boolean;
}

declare global {
  interface Window {
    __fake: FakeConfig & {
      starts: number;
      gumCalls: number;
      spoken: { text: string; lang: string; voice: string | null }[];
      setPermission: (p: FakeConfig['permission']) => void;
      setDevices: (labels: string[]) => void;
    };
  }
}

const nova = (page: Page) => page.getByRole('complementary', { name: 'NOVA assistant' });
const micButton = (page: Page) => nova(page).getByRole('button', { name: /voice input/i });

async function setup(page: Page, config: FakeConfig, storage: Record<string, string> = {}) {
  await page.addInitScript(
    ({ config, storage }) => {
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      const permListeners = new Set<() => void>();
      const fake = {
        ...config,
        starts: 0,
        gumCalls: 0,
        spoken: [] as { text: string; lang: string; voice: string | null }[],
        setPermission(p: typeof config.permission) {
          fake.permission = p;
          permListeners.forEach((l) => l());
        },
        setDevices(labels: string[]) {
          fake.devices = labels;
          navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
        },
      };
      window.__fake = fake as typeof window.__fake;

      // ── Permissions API ──
      const realQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = ((desc: PermissionDescriptor) => {
        if (desc.name !== 'microphone') return realQuery(desc);
        const status = new EventTarget() as PermissionStatus;
        Object.defineProperty(status, 'state', { get: () => fake.permission });
        permListeners.add(() => status.dispatchEvent(new Event('change')));
        return Promise.resolve(status);
      }) as typeof navigator.permissions.query;

      // ── Media devices ──
      const md = navigator.mediaDevices;
      md.enumerateDevices = async () => {
        if (fake.permission !== 'granted')
          // What Chrome really returns before permission: one anonymous entry per kind.
          return [{ kind: 'audioinput', deviceId: '', label: '', groupId: '' } as MediaDeviceInfo];
        if (fake.devices.length === 0) return [];
        return [
          {
            kind: 'audioinput',
            deviceId: 'default',
            label: `Default - ${fake.devices[0]}`,
            groupId: 'g',
          },
          ...fake.devices.map((label, i) => ({
            kind: 'audioinput',
            deviceId: `d${i}`,
            label,
            groupId: 'g',
          })),
        ] as MediaDeviceInfo[];
      };
      md.getUserMedia = async () => {
        fake.gumCalls++;
        if (fake.gumDelayMs) await new Promise((r) => setTimeout(r, fake.gumDelayMs));
        if (fake.gum !== 'ok') throw new DOMException(fake.gum.message, fake.gum.name);
        if (fake.devices.length === 0)
          throw new DOMException('Requested device not found', 'NotFoundError');
        if (fake.permissionAfterGum) fake.permission = fake.permissionAfterGum;
        // A real, silent audio track.
        const ctx = new AudioContext();
        return ctx.createMediaStreamDestination().stream;
      };

      // ── Speech recognition ──
      class FakeRecognition extends EventTarget {
        lang = '';
        interimResults = false;
        continuous = false;
        maxAlternatives = 1;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        onaudiostart: (() => void) | null = null;
        onsoundstart: (() => void) | null = null;
        onsoundend: (() => void) | null = null;
        onspeechstart: (() => void) | null = null;
        private session: RecSession | undefined;
        private done = false;
        private interim = '';
        start() {
          fake.starts++;
          this.session = fake.recognition.shift() ?? { kind: 'error', error: 'no-speech' };
          const s = this.session;
          setTimeout(() => {
            if (s.kind === 'silent') return;
            if (s.kind === 'hold' || s.audio !== false) {
              this.onaudiostart?.();
              this.onsoundstart?.();
            }
            if (s.kind === 'result') {
              this.emit(s.text, false);
              setTimeout(() => {
                this.emit(s.text, true);
                this.end();
              }, 60);
            } else if (s.kind === 'error') {
              this.onerror?.({ error: s.error });
              this.end();
            } else if (s.kind === 'hold' && s.interim) {
              this.interim = s.interim;
              this.emit(s.interim, false);
            }
          }, 40);
        }
        private emit(text: string, isFinal: boolean) {
          const result = Object.assign([{ transcript: text }], { isFinal });
          this.onresult?.({ resultIndex: 0, results: [result] });
        }
        private end() {
          if (this.done) return;
          this.done = true;
          setTimeout(() => this.onend?.(), 10);
        }
        stop() {
          if (this.interim) this.emit(this.interim, true);
          this.end();
        }
        abort() {
          this.onerror?.({ error: 'aborted' });
          this.end();
        }
      }
      const w = window as unknown as Record<string, unknown>;
      if (config.recognitionSupported === false) {
        delete w.SpeechRecognition;
        delete w.webkitSpeechRecognition;
      } else {
        w.SpeechRecognition = FakeRecognition;
        w.webkitSpeechRecognition = FakeRecognition;
      }

      // ── Speech synthesis ──
      const voices = [
        {
          voiceURI: 'fake-en',
          name: 'Fake English (India)',
          lang: 'en-IN',
          localService: true,
          default: true,
        },
        {
          voiceURI: 'fake-ml',
          name: 'Fake Malayalam',
          lang: 'ml-IN',
          localService: true,
          default: false,
        },
      ];
      class FakeUtterance {
        voice: { name: string } | null = null;
        lang = '';
        rate = 1;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onboundary: (() => void) | null = null;
        constructor(public text: string) {}
      }
      const synth = Object.assign(new EventTarget(), {
        getVoices: () => voices,
        speak(u: FakeUtterance) {
          fake.spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null });
          setTimeout(() => u.onstart?.(), 10);
          setTimeout(() => u.onend?.(), 80);
        },
        cancel() {},
        pause() {},
        resume() {},
        speaking: false,
        pending: false,
        paused: false,
      });
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      w.SpeechSynthesisUtterance = FakeUtterance;
    },
    { config, storage },
  );
  await page.goto('/studio');
  await expect(page.getByRole('region', { name: 'Production pipeline' })).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(nova(page).getByLabel('Message NOVA')).toBeVisible();
}

const read = (page: Page) =>
  page.evaluate(() => ({
    starts: window.__fake.starts,
    gumCalls: window.__fake.gumCalls,
    spoken: window.__fake.spoken,
  }));

const granted = (recognition: RecSession[], extra: Partial<FakeConfig> = {}): FakeConfig => ({
  permission: 'granted',
  gum: 'ok',
  devices: ['Microphone Array (AMD Audio Device)'],
  recognition,
  ...extra,
});

test.describe('NOVA voice', () => {
  test('spoken question reaches NOVA and the reply is read aloud', async ({ page }) => {
    await setup(page, granted([{ kind: 'result', text: 'Which workflows are blocked?' }]));
    await micButton(page).click();
    const panel = nova(page);
    await expect(panel.getByText('Which workflows are blocked?').first()).toBeVisible();
    await expect(panel.getByText('spoken')).toBeVisible();
    await expect(
      panel.getByText(/“Colour grade” is blocked and holds the stage/).last(),
    ).toBeVisible();
    await expect.poll(async () => (await read(page)).spoken.length).toBeGreaterThan(0);
    const { spoken } = await read(page);
    expect(spoken[0]!.voice).toBe('Fake English (India)');
    expect(spoken[0]!.lang).toBe('en-IN');
  });

  test('root cause: a speech-capture failure with a working microphone retries instead of claiming no microphone', async ({
    page,
  }) => {
    await setup(
      page,
      granted([
        { kind: 'error', error: 'audio-capture' },
        { kind: 'result', text: 'Which projects are delayed?' },
      ]),
    );
    await micButton(page).click();
    const panel = nova(page);
    await expect(panel.getByText('Which projects are delayed?').first()).toBeVisible();
    await expect(page.getByText(/No microphone was found/)).toHaveCount(0);
    expect((await read(page)).starts).toBe(2);
  });

  test('capture keeps failing with a working microphone: explains it is the speech service, not the device', async ({
    page,
  }) => {
    await setup(
      page,
      granted([
        { kind: 'error', error: 'audio-capture' },
        { kind: 'error', error: 'audio-capture' },
      ]),
    );
    await micButton(page).click();
    const card = page.locator('[data-voice-problem="capture-failed"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Speech recognition couldn’t hear the microphone');
    await expect(card).toContainText('Microphone Array (AMD Audio Device)');
    await expect(card).toContainText('chrome://settings/content/microphone');
    await expect(page.getByText(/No microphone/)).toHaveCount(0);
  });

  test('recognition that never receives audio stops with an explanation (watchdog)', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await setup(page, granted([{ kind: 'silent' }]));
    await micButton(page).click();
    await expect(nova(page).getByRole('button', { name: 'Stop voice input' })).toBeVisible();
    await expect(page.locator('[data-voice-problem="no-audio"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-voice-problem="no-audio"]')).toContainText(
      'received no audio',
    );
  });

  test('first use: asks permission, shows the prompt state, then listens', async ({ page }) => {
    await setup(page, {
      ...granted([{ kind: 'result', text: 'Show the workload of the team' }]),
      permission: 'prompt',
      permissionAfterGum: 'granted',
      gumDelayMs: 1200,
    });
    // Before permission the device list is anonymous — that must not read as "no microphone".
    await expect(page.getByText(/No microphone/)).toHaveCount(0);
    await micButton(page).click();
    await expect(nova(page).getByText(/microphone prompt/)).toBeVisible();
    await expect(nova(page).getByText('Show the workload of the team').first()).toBeVisible();
    expect((await read(page)).gumCalls).toBeGreaterThanOrEqual(1);
  });

  test('permission blocked: explains how to allow it in Chrome, and clears when allowed', async ({
    page,
  }) => {
    await setup(page, { ...granted([]), permission: 'denied' });
    await micButton(page).click();
    const card = page.locator('[data-voice-problem="blocked"]');
    await expect(card).toContainText('Microphone is blocked for this site');
    await expect(card).toContainText(new URL(page.url()).host);
    await expect(card).toContainText('chrome://settings/content/microphone');
    await expect(card.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect((await read(page)).starts).toBe(0);
    await page.evaluate(() => window.__fake.setPermission('granted'));
    await expect(card).toHaveCount(0);
  });

  test('permission prompt dismissed: asks to retry and allow', async ({ page }) => {
    await setup(page, {
      ...granted([]),
      permission: 'prompt',
      gum: { name: 'NotAllowedError', message: 'Permission dismissed' },
    });
    await micButton(page).click();
    await expect(page.locator('[data-voice-problem="dismissed"]')).toContainText(
      'Microphone permission needed',
    );
  });

  test('blocked by the operating system: gives Windows privacy steps', async ({ page }) => {
    await setup(page, {
      ...granted([]),
      permission: 'prompt',
      gum: { name: 'NotAllowedError', message: 'Permission denied by system' },
    });
    await micButton(page).click();
    const card = page.locator('[data-voice-problem="system-blocked"]');
    await expect(card).toContainText('Your computer is blocking the microphone');
    await expect(card).toContainText('Privacy & security › Microphone');
  });

  test('no device: says so, offers Retry, and notices a microphone being connected', async ({
    page,
  }) => {
    await setup(page, { ...granted([]), permission: 'prompt', devices: [] });
    await micButton(page).click();
    const card = page.locator('[data-voice-problem="no-device"]');
    await expect(card).toContainText('No microphone detected');
    await expect(card.getByRole('button', { name: 'Retry' })).toBeVisible();
    // Retry while still absent: same answer, not a silent failure.
    await card.getByRole('button', { name: 'Retry' }).click();
    await expect(card).toBeVisible();
    // Plug one in.
    await page.evaluate(() => {
      window.__fake.permission = 'granted';
      window.__fake.recognition.push({ kind: 'result', text: 'What needs my attention today?' });
      window.__fake.setDevices(['USB Microphone']);
    });
    await expect(card).toHaveCount(0);
    await expect(
      nova(page).getByText('Microphone connected: USB Microphone.', { exact: false }),
    ).toBeVisible();
    await micButton(page).click();
    await expect(nova(page).getByText('What needs my attention today?').first()).toBeVisible();
  });

  test('device busy: reports that it could not be started, not that it is missing', async ({
    page,
  }) => {
    await setup(page, {
      ...granted([]),
      permission: 'prompt',
      gum: { name: 'NotReadableError', message: 'Could not start audio source' },
    });
    await micButton(page).click();
    await expect(page.locator('[data-voice-problem="busy"]')).toContainText(
      'The microphone couldn’t be started',
    );
  });

  test('microphone disconnected while listening', async ({ page }) => {
    await setup(page, granted([{ kind: 'hold' }]));
    await micButton(page).click();
    await expect(nova(page).getByRole('button', { name: 'Stop voice input' })).toBeVisible();
    await page.evaluate(() => window.__fake.setDevices([]));
    await expect(page.locator('[data-voice-problem="disconnected"]')).toContainText(
      'Microphone disconnected',
    );
    await expect(nova(page).getByRole('button', { name: 'Start voice input' })).toBeVisible();
  });

  test('stop listening delivers what was heard; Esc cancels without sending', async ({ page }) => {
    await setup(
      page,
      granted([
        { kind: 'hold', interim: 'Which workflows are blocked' },
        { kind: 'hold', interim: 'This should be discarded' },
      ]),
    );
    const panel = nova(page);
    await micButton(page).click();
    await expect(panel.getByLabel('Message NOVA')).toHaveValue('Which workflows are blocked');
    await panel.getByRole('button', { name: 'Stop voice input' }).click();
    await expect(
      panel.getByText(/“Colour grade” is blocked and holds the stage/).last(),
    ).toBeVisible();

    await expect(panel.getByRole('button', { name: 'Start voice input' })).toBeEnabled();
    await micButton(page).click();
    await expect(panel.getByLabel('Message NOVA')).toHaveValue('This should be discarded');
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: 'Start voice input' })).toBeVisible();
    await expect(panel.getByText('This should be discarded')).toHaveCount(0);
    await expect(page.locator('[data-voice-problem]')).toHaveCount(0);
  });

  test('review mode: recognised text waits in the box and is sent as a spoken message', async ({
    page,
  }) => {
    await setup(page, granted([{ kind: 'result', text: 'Which workflows are blocked?' }]), {
      'nova-voice-auto-send': '0',
    });
    const panel = nova(page);
    await micButton(page).click();
    await expect(panel.getByLabel('Message NOVA')).toHaveValue('Which workflows are blocked?');
    await expect(panel.getByText(/Recognised speech/)).toBeVisible();
    await expect(panel.getByText('spoken')).toHaveCount(0);
    await panel.getByLabel('Message NOVA').press('Enter');
    await expect(panel.getByText('spoken')).toBeVisible();
    await expect(
      panel.getByText(/“Colour grade” is blocked and holds the stage/).last(),
    ).toBeVisible();
  });

  test('unsupported browser: explains, and text chat still works', async ({ page }) => {
    await setup(page, { ...granted([]), recognitionSupported: false });
    const panel = nova(page);
    await micButton(page).click();
    await expect(page.locator('[data-voice-problem="recognition-unsupported"]')).toContainText(
      'Voice input isn’t available in this browser',
    );
    await panel.getByLabel('Message NOVA').fill('Which workflows are blocked?');
    await panel.getByLabel('Message NOVA').press('Enter');
    await expect(
      panel.getByText(/“Colour grade” is blocked and holds the stage/).last(),
    ).toBeVisible();
  });

  test('hiding the tab stops listening', async ({ page }) => {
    await setup(page, granted([{ kind: 'hold' }]));
    await micButton(page).click();
    await expect(nova(page).getByRole('button', { name: 'Stop voice input' })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('[data-voice-problem="hidden"]')).toContainText('Listening stopped');
  });

  test('microphone check in voice settings reports permission and device', async ({ page }) => {
    await setup(page, granted([]));
    await nova(page).getByRole('button', { name: 'Voice and language settings' }).click();
    await page.getByRole('button', { name: 'Check microphone' }).click();
    await expect(page.getByTestId('mic-status')).toContainText('Permission: Allowed');
    await expect(page.getByTestId('mic-status')).toContainText(
      'Microphone Array (AMD Audio Device)',
    );
  });
});
