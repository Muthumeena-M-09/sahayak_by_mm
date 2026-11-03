import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.route('**/src/context/AppContext.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const useApp=()=>({apiFetch:async(url,init)=>{(window.voiceApiCalls??=[]).push(JSON.parse(init.body)); if(window.voiceApiResult)return window.voiceApiResult; throw new Error("AI unavailable in fixture");}});' }));
  await page.addInitScript(() => {
    const state = window as any;
    state.sessions = []; state.utterances = [];
    state.SpeechRecognition = class {
      onstart: any; onresult: any; onerror: any; onend: any;
      start() { state.sessions.push(this); this.onstart?.(); }
      abort() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, cancel() { this.speaking = false; },
      speak(utterance: any) { state.utterances.push(utterance); this.speaking = true; }
    } });
    state.emit = (texts: string[]) => state.sessions.at(-1).onresult?.({ resultIndex: 0, results: texts.map(transcript => ({ isFinal: true, 0: { transcript } })) });
    state.finish = () => { (window.speechSynthesis as any).speaking = false; state.utterances.at(-1).onend?.(); };
  });
  await page.goto('/tests/voice/fixture.html');
});
async function emit(page: Page, ...texts: string[]) { await page.evaluate(texts => (window as any).emit(texts), texts); }
async function finish(page: Page) { await page.evaluate(() => (window as any).finish()); await page.clock.runFor(600); }

test('wake phrase acknowledges and accepts a separate follow-up command', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'hey sahayak');
  await expect(page.getByRole('status')).toHaveText('Yes? Say your command.');
  await finish(page); await emit(page, 'open documents');
  await expect(page.locator('#destination')).toHaveText('documents');
});
test('Speak command also handles a standalone wake phrase without enabling continuous listening', async ({ page }) => {
  await page.getByRole('button', { name: 'Speak command', exact: true }).click();
  await emit(page, 'Hey, Sahayak!'); await finish(page); await emit(page, 'open services');
  await expect(page.locator('#destination')).toHaveText('services');
  await expect(page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
test('all final results in one event contribute to the command', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'Hey Sahayak', 'open services');
  await expect(page.locator('#destination')).toHaveText('services');
});
test('silent synthesis without an end event resumes the wake listener', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'hey sahayak');
  await page.evaluate(() => { (window.speechSynthesis as any).speaking = false; });
  await page.clock.runFor(2200); await emit(page, 'open documents');
  await expect(page.locator('#destination')).toHaveText('documents');
});
test('follow-up timeout starts after playback, and Stop prevents resurrection', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'hey sahayak'); await page.clock.runFor(8000); await finish(page);
  await page.clock.runFor(9000); await emit(page, 'open documents');
  await expect(page.locator('#destination')).toHaveText('documents');
  await page.getByRole('button', { name: 'Stop microphone and audio', exact: true }).click();
  const before = await page.evaluate(() => (window as any).sessions.length);
  await finish(page); await page.clock.runFor(20000);
  expect(await page.evaluate(() => (window as any).sessions.length)).toBe(before);
});
test('unmatched wake text is visible and cannot navigate', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'open documents');
  await expect(page.getByText('Heard:', { exact: false })).toContainText('open documents');
  await expect(page.locator('#destination')).toHaveText('');
  await expect(page.getByRole('status')).toContainText('no wake phrase matched');
});

test('normal idle-session endings do not disable the wake phrase after five restarts', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(5000);
    await page.evaluate(() => (window as any).sessions.at(-1).onend?.());
    await page.clock.runFor(600);
  }
  await expect(page.getByRole('button', { name: 'Disable Hey Sahayak', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await emit(page, 'hey sahayak open services');
  await expect(page.locator('#destination')).toHaveText('services');
});

test('stop listening works without the wake phrase and prevents restart', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'stop listening'); await finish(page);
  await expect(page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as any).sessions.length)).toBe(1);
});
test('typed commands work without microphone access and can correct heard text', async ({ page }) => {
  await page.getByLabel('Type or correct a voice command').fill('mere documents dikhao');
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
  await expect(page.locator('#destination')).toHaveText('documents');
  expect(await page.evaluate(() => (window as any).sessions.length)).toBe(0);
  await page.getByRole('button', { name: 'Edit heard command', exact: true }).click();
  await expect(page.getByLabel('Type or correct a voice command')).toHaveValue('mere documents dikhao');
  expect(await page.evaluate(() => (window as any).voiceApiCalls ?? [])).toEqual([]);
});
test('AI clarification accepts a direct reply and passes the previous context', async ({ page }) => {
  await page.evaluate(() => { (window as any).voiceApiResult = { intent: { type: 'unknown' }, clarification: 'Documents or services?' }; });
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'hey sahayak where are my things');
  await expect(page.getByRole('status')).toContainText('Documents or services?');
  await finish(page);
  await page.evaluate(() => { (window as any).voiceApiResult = { intent: { type: 'navigate', screen: 'documents' } }; });
  await emit(page, 'the uploaded files');
  await expect(page.locator('#destination')).toHaveText('documents');
  const calls = await page.evaluate(() => (window as any).voiceApiCalls);
  expect(calls[1].previousText).toBe('where are my things');
  expect(calls[1].clarification).toBe('Documents or services?');
});
test('reply window expires and unrelated speech cannot navigate afterwards', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'hey sahayak'); await finish(page); await page.clock.runFor(15100);
  await emit(page, 'open documents');
  await expect(page.locator('#destination')).toHaveText('');
});
test('spoken replies can be disabled and a playing reply can be skipped', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await emit(page, 'hey sahayak');
  await page.getByRole('button', { name: 'Skip spoken reply', exact: true }).click();
  await page.clock.runFor(600); await emit(page, 'open services');
  await expect(page.locator('#destination')).toHaveText('services');
  await page.getByLabel('Spoken replies', { exact: true }).uncheck();
  const before = await page.evaluate(() => (window as any).utterances.length);
  await page.getByLabel('Type or correct a voice command').fill('open documents');
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
  expect(await page.evaluate(() => (window as any).utterances.length)).toBe(before);
});
test('network errors retry three times then leave the microphone off', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  for (const delay of [1100, 2100, 4100]) {
    await page.evaluate(() => (window as any).sessions.at(-1).onerror?.({ error: 'network' }));
    await page.clock.runFor(delay);
  }
  expect(await page.evaluate(() => (window as any).sessions.length)).toBe(4);
  await page.evaluate(() => (window as any).sessions.at(-1).onerror?.({ error: 'network' }));
  await expect(page.getByRole('status')).toContainText('Speech service is unavailable');
  await finish(page);
  expect(await page.evaluate(() => (window as any).sessions.length)).toBe(4);
});
test('permission denial is actionable and typing remains available', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await page.evaluate(() => (window as any).sessions.at(-1).onerror?.({ error: 'not-allowed' }));
  await expect(page.getByRole('status')).toContainText('Microphone access was denied');
  await expect(page.getByLabel('Type or correct a voice command')).toBeEnabled();
});
test('mobile layout keeps voice controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.browser-check/voice-mobile.png', fullPage: true });
});

test('microphone startup timeout leaves controls recoverable', async ({ page }) => {
  await page.evaluate(() => { (window as any).SpeechRecognition.prototype.start = function () { (window as any).sessions.push(this); }; });
  await page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true }).click();
  await page.clock.runFor(10100);
  await expect(page.getByRole('status')).toContainText('Microphone did not start');
  await expect(page.getByRole('button', { name: 'Enable Hey Sahayak', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
test('speech speed applies to the next reply', async ({ page }) => {
  await page.getByLabel('Speech speed', { exact: true }).selectOption('1.15');
  await page.getByLabel('Type or correct a voice command').fill('open services');
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
  expect(await page.evaluate(() => (window as any).utterances.at(-1).rate)).toBeCloseTo(1.15);
});
