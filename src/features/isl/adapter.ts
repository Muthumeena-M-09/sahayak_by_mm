import * as ort from 'onnxruntime-web/wasm';
import { classify, type RecognizerAdapter } from './core.ts';
export class IncludeAdapter implements RecognizerAdapter {
  private session?: ort.InferenceSession;
  private labels: string[] = [];
  async init() {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = `${location.origin}/isl/ort/`;
    const [modelResponse, manifestResponse] = await Promise.all([fetch('/isl/model.onnx'), fetch('/isl/manifest.json')]);
    if (!modelResponse.ok || !manifestResponse.ok) throw new Error('Local ISL model files are missing. Run npm run isl:prepare.');
    const manifest = await manifestResponse.json();
    const model = await modelResponse.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', model)), b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== '4abd701d12076d0f68d50039a6660352a42808dd7dda84932a8b29c23e4c0c2a'
      || manifest.modelSha256 !== digest || manifest.labels.length !== 263) throw new Error('ISL model integrity check failed.');
    this.labels = manifest.labels;
    this.session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  }
  async predict(landmarks: Float32Array) {
    if (!this.session) throw new Error('Recognizer is not initialized');
    if (landmarks.length !== 169 * 134 || !landmarks.every(Number.isFinite)) throw new Error('Invalid landmarks');
    const result = await this.session.run({ landmarks: new ort.Tensor('float32', landmarks, [1, 169, 134]) });
    return classify(result.logits.data as Float32Array, this.labels);
  }
  async dispose() { await this.session?.release(); this.session = undefined; }
}
