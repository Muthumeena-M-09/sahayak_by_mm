import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
// Input manifest: [{path, expectedLabel, signer, split}]. All files stay local.
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: node scripts/evaluate-isl-browser.mjs path/to/local-manifest.json');
const samples = JSON.parse(await readFile(manifestPath, 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('console', message => console.log('browser:', message.type(), message.text()));
  page.on('pageerror', error => console.error('browser error:', error.message));
  await page.goto('http://127.0.0.1:5176/?isl-test');
  const results = [];
  for (const sample of samples) {
    await page.route('**/__local_isl_clip', route => route.fulfill({ path: path.resolve(sample.path), contentType: 'video/quicktime' }));
    const result = await page.evaluate(async () => {
      const { evaluateVideo } = await import('/ml/evaluate-browser.ts');
      return evaluateVideo('/__local_isl_clip');
    });
    results.push({ ...sample, ...result, correct: sample.expectedLabel === result.prediction.label });
    await page.unroute('**/__local_isl_clip');
    console.log(sample.expectedLabel, result);
  }
  const perSign = {};
  for (const result of results) {
    const entry = perSign[result.expectedLabel] ??= { correct: 0, count: 0 };
    entry.count++; if (result.correct) entry.correct++;
  }
  await mkdir('ml/output', { recursive: true });
  await writeFile('ml/output/browser-evaluation.json', JSON.stringify({ results, perSign,
    warning: 'Only a held-out, signer-disjoint manifest supports held-out per-sign accuracy claims. Confidence is uncalibrated.' }, null, 2));
} finally { await browser.close(); }
