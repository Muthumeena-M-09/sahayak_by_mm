import { test } from 'node:test';
import assert from 'node:assert/strict';
import { includeFrame, includeClip, classify, PredictionSmoother, appendConfirmed, cameraError } from './core.ts';
test('legacy map preserves first 25 points and scales interleaved coordinates', () => {
  const pose = Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: i / 100 }));
  const hands = [Array.from({ length: 21 }, () => ({ x: 0.15, y: 0.15 }))];
  const result = includeFrame(pose, hands)!;
  assert.equal(result.length, 134); assert.equal(result[48], 0.24 * 1920);
  assert.equal(result[50], 0.15 * 1920); assert.ok(Number.isNaN(result[92]));
  assert.equal(includeFrame([], hands), null); assert.equal(includeFrame(pose, []), null);
});
test('right-only hand occupies the second hand slot', () => {
  const pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0 })); pose[16] = { x: 1, y: 1 };
  const frame = includeFrame(pose, [Array.from({ length: 21 }, () => ({ x: 1, y: 1 }))])!;
  assert.ok(Number.isNaN(frame[50])); assert.equal(frame[92], 1920);
});
test('interpolation fills temporal gaps and edges, zeros absent columns and padding', () => {
  const frames = Array.from({ length: 5 }, () => Array(134).fill(NaN));
  frames[1][0] = 10; frames[3][0] = 30;
  const clip = includeClip(frames);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => clip[i * 134]), [10, 10, 20, 30, 30]);
  assert.equal(clip[1], 0); assert.equal(clip[5 * 134], 0); assert.ok(clip.every(Number.isFinite));
  assert.throws(() => includeClip([])); assert.throws(() => includeClip(Array(170).fill(Array(134).fill(0))));
});
test('smoothing rejects unsupported, low and invalid confidence and requires consecutive matches', () => {
  const smoother = new PredictionSmoother(new Set(['hello']));
  const p = { label: 'hello', confidence: 0.9 };
  assert.equal(smoother.push(p), null); assert.equal(smoother.push(p), null);
  assert.deepEqual(smoother.push(p), p);
  for (const invalid of [null, { ...p, label: 'dog' }, { ...p, confidence: NaN }, { ...p, confidence: 0.8 }]) {
    assert.equal(smoother.push(invalid), null); assert.equal(smoother.push(p), null);
  }
});
test('full model winner is retained, rather than forcing supported signs', () => {
  const logits = Array(263).fill(-1000), labels = Array.from({ length: 263 }, (_, i) => String(i));
  logits[200] = 1000; assert.deepEqual(classify(logits, labels), { label: '200', confidence: 1 });
  logits[2] = NaN; assert.throws(() => classify(logits, labels));
});
test('phrase building requires caller confirmation and bounds text; camera errors give fallbacks', () => {
  assert.equal(appendConfirmed(' hello ', ' school '), 'hello school');
  assert.equal(appendConfirmed('a'.repeat(500), 'b').length, 500);
  assert.match(cameraError('NotAllowedError'), /permission was denied/);
  assert.match(cameraError('NotFoundError'), /No suitable camera/);
  assert.match(cameraError('NotReadableError'), /Close other apps/);
});
