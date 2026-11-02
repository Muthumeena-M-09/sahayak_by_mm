import { test, expect } from '@playwright/test';

test('consent, explicit phrase submission and text fallback', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/?isl-test');
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeDisabled();
  await page.getByLabel('Review or edit your phrase').fill('Hospital');
  await expect(page.getByText('Confirmed locally: Hospital')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm and send phrase' }).click();
  await expect(page.getByText('Confirmed locally: Hospital')).toBeVisible();
  expect(writes).toEqual([]);
});

for (const [name, message] of [['NotAllowedError', 'Camera permission was denied'], ['NotFoundError', 'No suitable camera'], ['NotReadableError', 'Close other apps']]) {
  test(`camera error: ${name}`, async ({ page }) => {
    await page.addInitScript(errorName => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test', errorName); };
    }, name);
    await page.goto('/?isl-test');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('button', { name: 'Use Text / Voice' })).toBeEnabled();
  });
}

test('actual worker loads local models, processes a frame and releases camera', async ({ page }) => {
  const external: string[] = [], writes: string[] = [], errors: string[] = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5176') && !request.url().startsWith('data:')) external.push(request.url());
    if (request.method() !== 'GET') writes.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      (window as any).islTestStream = stream;
      return stream;
    };
  });
  await page.goto('/?isl-test');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByText(/Ready\. Keep your upper body/)).toBeVisible({ timeout: 65000 });
  await page.getByRole('button', { name: 'Sign a word / Retry' }).click();
  await expect(page.getByText(/Keep your upper body and hands visible/)).toBeVisible({ timeout: 20000 });
  // Fake browser video is a test pattern, never an ISL recognition fixture.
  await expect(page.getByText('Suggestion:', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  expect(await page.evaluate(() => (window as any).islTestStream.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  expect(writes).toEqual([]);
  // Existing app fonts may be requested by global CSS; inference must not call
  // external services. Capture model/asset requests independently of fonts.
  expect(external.filter(url => !url.includes('fonts.googleapis.com') && !url.includes('fonts.gstatic.com'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('real ONNX WASM adapter runs locally and rejects malformed landmarks', async ({ page }) => {
  await page.goto('/?isl-test');
  const result = await page.evaluate(async () => {
    const { IncludeAdapter } = await import('/src/features/isl/adapter.ts' as string);
    const adapter = new IncludeAdapter();
    await adapter.init();
    const first = await adapter.predict(new Float32Array(169 * 134));
    const second = await adapter.predict(new Float32Array(169 * 134));
    let rejected = false;
    try { await adapter.predict(new Float32Array(1)); } catch { rejected = true; }
    await adapter.dispose();
    return { first, second, rejected };
  });
  expect(result.rejected).toBe(true);
  expect(result.first).toEqual(result.second);
  expect(result.first.confidence).toBeGreaterThanOrEqual(0);
  expect(result.first.confidence).toBeLessThanOrEqual(1);
});

test('a suggestion needs word confirmation and a separate phrase submission', async ({ page }) => {
  // Test-only recognition fixture. Production always uses the actual worker.
  await page.addInitScript(() => {
    (window as any).Worker = class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      clip = 0;
      postMessage(data: any) {
        if (data.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
        if (data.type === 'reset') this.clip = data.clip;
        if (data.type === 'frame') { data.bitmap.close(); setTimeout(() => this.onmessage?.({ data: { type: 'result', clip: this.clip, stable: { label: 'hello', confidence: 0.9 }, tracking: true, frames: 25 } }), 0); }
      }
      terminate() {}
    };
  });
  await page.goto('/?isl-test');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await page.getByRole('button', { name: 'Sign a word / Retry' }).click();
  await expect(page.getByText(/Suggestion: Hello/)).toBeVisible();
  await expect(page.getByLabel('Review or edit your phrase')).toHaveValue('');
  await expect(page.getByText(/Confirmed locally:/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm word', exact: true }).click();
  await expect(page.getByLabel('Review or edit your phrase')).toHaveValue('Hello');
  await expect(page.getByText(/Confirmed locally:/)).toHaveCount(0);
  await page.getByLabel('Review or edit your phrase').fill('Hello school');
  await page.getByRole('button', { name: 'Confirm and send phrase' }).click();
  await expect(page.getByText('Confirmed locally: Hello school')).toBeVisible();
});

test('mobile layout keeps the controls within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?isl-test');
  await expect(page.getByRole('heading', { name: 'Sahayak ISL Assist · Experimental' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.browser-check/isl-mobile.png', fullPage: true });
});
