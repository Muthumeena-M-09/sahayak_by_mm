import { PREPROCESSING_ID } from './preprocessing.ts';
import { validateLabels } from './signs.ts';
import type { Prediction } from './smoothing.ts';

export interface ModelManifest {
  language: 'ISL'; labels: string[]; preprocessing: string; modelSha256: string;
  recognitionEnabled: boolean; disabledReason: string; threshold: number;
}
export interface RecognizerAdapter {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disposed';
  vocabulary: readonly string[];
  init(manifest: ModelManifest): Promise<void>;
  predict(sequence: Float32Array): Promise<Prediction>;
  dispose(): Promise<void>;
}
export function validateManifest(value: unknown): ModelManifest {
  const manifest = value as ModelManifest;
  if (!manifest || manifest.language !== 'ISL' || manifest.preprocessing !== PREPROCESSING_ID ||
      !/^[a-f0-9]{64}$/.test(manifest.modelSha256) || typeof manifest.recognitionEnabled !== 'boolean' ||
      !(manifest.threshold >= .5 && manifest.threshold <= 1)) throw new Error('Invalid or missing ISL model manifest.');
  validateLabels(manifest.labels);
  return manifest;
}
export class OnnxRecognizer implements RecognizerAdapter {
  status: RecognizerAdapter['status'] = 'idle';
  vocabulary: readonly string[] = [];
  private session: import('onnxruntime-web').InferenceSession | null = null;
  private ort: typeof import('onnxruntime-web') | null = null;
  async init(manifest: ModelManifest) {
    validateManifest(manifest);
    this.status = 'loading';
    try {
      this.ort = await import('onnxruntime-web/wasm');
      this.ort.env.wasm.numThreads = 1;
      this.ort.env.wasm.wasmPaths = new URL('/ort/', globalThis.location.origin).href;
      const response = await fetch('/models/isl/model.onnx', {cache: 'no-cache'});
      if (!response.ok) throw new Error('ISL model is missing.');
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hex = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('');
      if (hex !== manifest.modelSha256) throw new Error('ISL model integrity check failed.');
      this.session = await this.ort.InferenceSession.create(bytes, {executionProviders: ['wasm'], graphOptimizationLevel: 'all'});
      if (this.session.inputNames[0] !== 'landmarks' || this.session.outputNames[0] !== 'logits') throw new Error('Unexpected ISL model interface.');
      this.vocabulary = manifest.labels;
      this.status = 'ready';
    } catch (error) { this.status = 'error'; await this.session?.release(); this.session = null; throw error; }
  }
  async predict(sequence: Float32Array): Promise<Prediction> {
    const logits = await this.predictLogits(sequence);
    const max = Math.max(...logits), exps = logits.map(v => Math.exp(v-max));
    const best = logits.indexOf(max);
    return {label: this.vocabulary[best], confidence: exps[best]/exps.reduce((a,b)=>a+b,0)};
  }
  async predictLogits(sequence: Float32Array): Promise<number[]> {
    if (this.status !== 'ready' || !this.session || !this.ort) throw new Error('ISL model is not ready.');
    if (sequence.length !== 7200 || !sequence.every(Number.isFinite)) throw new Error('Expected finite [1,32,225] sequence.');
    const output = await this.session.run({landmarks: new this.ort.Tensor('float32', sequence, [1,32,225])});
    const logits = Array.from(output.logits.data as Float32Array);
    if (logits.length !== this.vocabulary.length || !logits.every(Number.isFinite)) throw new Error('Invalid model output.');
    return logits;
  }
  async dispose() { await this.session?.release(); this.session = null; this.status = 'disposed'; }
}
