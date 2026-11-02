export const PREPROCESSING_ID = 'holistic75-shoulder-v1';
export type LandmarkFrame = Float32Array;

/** Same float32 shoulder normalization and interpolation as ml/isl_preprocessing.py. */
export function preprocess(frames: readonly LandmarkFrame[]): Float32Array {
  if (frames.length < 2) throw new Error('At least two landmark frames are required.');
  const normalized = frames.map(frame => {
    if (frame.length !== 225 || !frame.every(Number.isFinite)) throw new Error('Invalid landmarks.');
    const left = 11 * 3, right = 12 * 3;
    if (![left, right].every(i => frame.slice(i, i + 3).some(v => v !== 0))) throw new Error('Keep both shoulders visible.');
    const scale = Math.fround(Math.hypot(frame[left] - frame[right], frame[left + 1] - frame[right + 1]));
    if (scale < .001) throw new Error('Keep both shoulders visible.');
    const center = [0, 1, 2].map(c => Math.fround(Math.fround(frame[left + c] + frame[right + c]) / 2));
    const result = new Float32Array(225);
    for (let joint = 0; joint < 75; joint++) {
      const offset = joint * 3;
      if (frame.slice(offset, offset + 3).some(v => v !== 0)) {
        for (let c = 0; c < 3; c++) result[offset + c] = Math.fround(Math.fround(frame[offset + c] - center[c]) / scale);
      }
    }
    return result;
  });
  const result = new Float32Array(32 * 225);
  for (let t = 0; t < 32; t++) {
    const position = t * (frames.length - 1) / 31;
    const low = Math.floor(position), high = Math.min(low + 1, frames.length - 1), weight = Math.fround(position - low);
    for (let f = 0; f < 225; f++) result[t * 225 + f] = Math.fround(
      Math.fround(normalized[low][f] * Math.fround(1 - weight)) + Math.fround(normalized[high][f] * weight));
  }
  return result;
}

export class TemporalBuffer {
  private frames: LandmarkFrame[] = [];
  constructor(readonly capacity = 32) {}
  push(frame: LandmarkFrame) {
    if (frame.length !== 225 || !frame.every(Number.isFinite)) throw new Error('Invalid landmark frame.');
    this.frames.push(frame.slice());
    if (this.frames.length > this.capacity) this.frames.shift();
  }
  get length() { return this.frames.length; }
  snapshot() { return this.frames.map(frame => frame.slice()); }
  clear() { this.frames = []; }
}
