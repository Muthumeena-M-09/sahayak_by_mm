import { mkdir, readFile, copyFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'public/isl');
await mkdir(target, { recursive: true });
const model = await readFile(path.join(root, 'ml/output/include/model.onnx'));
const digest = createHash('sha256').update(model).digest('hex');
if (digest !== '4abd701d12076d0f68d50039a6660352a42808dd7dda84932a8b29c23e4c0c2a') throw new Error('Run the verified INCLUDE exporter first. Model hash differs.');
const report = JSON.parse(await readFile(path.join(root, 'docs/isl-include-conversion.json'), 'utf8'));
const labels = Object.entries(report.labels).sort((a, b) => a[1] - b[1]).map(([label]) => label);
await writeFile(path.join(target, 'model.onnx'), model);
await writeFile(path.join(target, 'manifest.json'), JSON.stringify({ modelSha256: digest, labels }, null, 2));
for (const [source, destination, pattern] of [
  ['node_modules/@mediapipe/tasks-vision/wasm', 'mediapipe', /\.(js|wasm)$/],
  ['node_modules/onnxruntime-web/dist', 'ort', /^ort-wasm-simd-threaded\.(mjs|wasm)$/],
]) {
  await mkdir(path.join(target, destination), { recursive: true });
  for (const file of await readdir(path.join(root, source))) {
    if (pattern.test(file)) await copyFile(path.join(root, source, file), path.join(target, destination, file));
  }
}
const artifacts = {};
for (const [name, url] of [
  ['hand_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  ['pose_landmarker_lite.task', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Cannot download ${name}: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(target, name), data);
  artifacts[name] = { source: url, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length };
}
await writeFile(path.join(target, 'asset-provenance.json'), JSON.stringify(artifacts, null, 2));
await writeFile(path.join(target, 'NOTICE.txt'), 'Experimental INCLUDE ISL model. Source: AI4Bharat/INCLUDE, commit df348f4a640060d4d39f02556d9f96851e8c46c7 (MIT code). Dataset: Sridhar et al., INCLUDE, ACM MM 2020, https://zenodo.org/records/4010759 (CC BY 4.0). Export disables evaluation dropout. Recognition accuracy unmeasured. MediaPipe Tasks and ONNX Runtime retain their respective package licenses. Review checkpoint reuse terms before redistribution.\n');
console.log('Local ISL assets prepared. Set VITE_ENABLE_ISL_ASSIST=true and restart the dev server.');
