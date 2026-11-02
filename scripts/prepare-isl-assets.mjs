import {mkdir, readdir, copyFile} from 'node:fs/promises';
const sets = [
  ['node_modules/@mediapipe/holistic','public/mediapipe/holistic', name => /\.(js|wasm|data|binarypb|tflite)$/.test(name) && !name.includes('heavy')],
  ['node_modules/onnxruntime-web/dist','public/ort', name => ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'].includes(name)],
];
for (const [from,to,filter] of sets) {
  await mkdir(to,{recursive:true});
  for (const name of await readdir(from)) if(filter(name)) await copyFile(`${from}/${name}`,`${to}/${name}`);
}
console.log('Prepared local ISL runtime assets; no CDN requests needed.');
