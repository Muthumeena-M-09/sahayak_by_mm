import { OnnxRecognizer, type ModelManifest } from '../lib/isl/recognizer.ts';
const adapter = new OnnxRecognizer();
let busy = false;
globalThis.onmessage = async (event: MessageEvent<{id: number; type: string; manifest?: ModelManifest; sequence?: Float32Array}>) => {
  const {id, type, manifest, sequence} = event.data;
  if (busy) { globalThis.postMessage({id,error:'Recognition is busy.'}); return; }
  busy = true;
  try {
    if (type === 'init') await adapter.init(manifest!);
    else if (type === 'predict') { globalThis.postMessage({id, prediction: await adapter.predict(sequence!)}); return; }
    else if (type === 'dispose') await adapter.dispose();
    else throw new Error('Unsupported recognition request.');
    globalThis.postMessage({id, ready: adapter.status === 'ready'});
  } catch (error) { globalThis.postMessage({id, error: error instanceof Error ? error.message : 'Recognition failed.'}); }
  finally { busy = false; }
};
