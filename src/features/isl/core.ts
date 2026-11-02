export type Point = { x: number; y: number; visibility?: number };
export type Prediction = { label: string; confidence: number };
export interface RecognizerAdapter {
  init(): Promise<void>;
  predict(landmarks: Float32Array): Promise<Prediction>;
  dispose(): Promise<void>;
}
// Legacy upper_body_only is indices 0..24; see the source evidence in docs.
export function includeFrame(pose: Point[], hands: Point[][]): number[] | null {
  if (pose.length < 25 || !hands.length || hands.some(h => h.length !== 21)) return null;
  if ([11, 12, 15, 16].some(i => (pose[i].visibility ?? 1) < 0.5)) return null;
  let first: Point[] | undefined = hands[0], second: Point[] | undefined = hands[1];
  // Preserve upstream two-hand ordering. Only a single hand is wrist-assigned.
  if (!second) {
    const wrist = first[0];
    const distance = (p: Point) => (p.x - wrist.x) ** 2 + (p.y - wrist.y) ** 2;
    if (distance(pose[16]) < distance(pose[15])) { second = first; first = undefined; }
  }
  return [...pose.slice(0, 25), ...(first ?? Array(21).fill(null)),
    ...(second ?? Array(21).fill(null))].flatMap(p => p ? [p.x * 1920, p.y * 1080] : [NaN, NaN]);
}
// Bidirectional interpolation, per column; entirely missing columns become zero.
export function includeClip(frames: number[][]): Float32Array {
  if (!frames.length || frames.length > 169 || frames.some(f => f.length !== 134)) throw new Error('Invalid clip dimensions');
  const output = new Float32Array(169 * 134);
  for (let column = 0; column < 134; column++) {
    const known = frames.map((f, i) => Number.isFinite(f[column]) ? i : -1).filter(i => i >= 0);
    if (!known.length) continue;
    let nextIndex = 0;
    for (let row = 0; row < frames.length; row++) {
      while (nextIndex < known.length - 1 && known[nextIndex] < row) nextIndex++;
      const next = known[nextIndex], previous = known[Math.max(0, nextIndex - 1)];
      output[row * 134 + column] = row <= known[0] ? frames[known[0]][column]
        : row >= known.at(-1)! ? frames[known.at(-1)!][column]
        : frames[previous][column] + (frames[next][column] - frames[previous][column]) * (row - previous) / (next - previous);
    }
  }
  return output;
}
export function classify(logits: ArrayLike<number>, labels: string[]): Prediction {
  if (logits.length !== 263 || labels.length !== 263) throw new Error('Model label mismatch');
  const values = Array.from(logits);
  if (!values.every(Number.isFinite)) throw new Error('Non-finite model output');
  const maximum = Math.max(...values), index = values.indexOf(maximum);
  return { label: labels[index], confidence: 1 / values.reduce((sum, value) => sum + Math.exp(value - maximum), 0) };
}
export class PredictionSmoother {
  private label = '';
  private count = 0;
  constructor(private supported: Set<string>, private threshold = 0.85, private required = 3) {}
  reset() { this.label = ''; this.count = 0; }
  push(prediction: Prediction | null): Prediction | null {
    if (!prediction || !Number.isFinite(prediction.confidence) || prediction.confidence < this.threshold
      || prediction.confidence > 1 || !this.supported.has(prediction.label)) { this.reset(); return null; }
    this.count = prediction.label === this.label ? this.count + 1 : 1;
    this.label = prediction.label;
    return this.count >= this.required ? prediction : null;
  }
}
export function appendConfirmed(phrase: string, text: string): string {
  return [phrase.trim(), text.trim()].filter(Boolean).join(' ').slice(0, 500);
}
export function cameraError(name: string): string {
  if (['NotAllowedError', 'SecurityError'].includes(name)) return 'Camera permission was denied. Allow it in browser settings, or use Text/Voice.';
  if (['NotFoundError', 'OverconstrainedError'].includes(name)) return 'No suitable camera was found. Connect a camera or use Text/Voice.';
  if (['NotReadableError', 'AbortError'].includes(name)) return 'Camera could not start. Close other apps using it and retry.';
  return 'Camera is unavailable. Use HTTPS or localhost and try again, or use Text/Voice.';
}
