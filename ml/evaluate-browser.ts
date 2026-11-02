// Evaluation helper served only by the development server. Never uploads clips.
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { IncludeAdapter } from '../src/features/isl/adapter.ts';
import { includeClip, includeFrame } from '../src/features/isl/core.ts';

export async function evaluateVideo(url: string) {
  const wasm = await FilesetResolver.forVisionTasks('/isl/mediapipe');
  console.log('Evaluation: loading hand tracker');
  const hands = await HandLandmarker.createFromOptions(wasm, { baseOptions: { modelAssetPath: '/isl/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 });
  const pose = await PoseLandmarker.createFromOptions(wasm, { baseOptions: { modelAssetPath: '/isl/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'VIDEO' });
  console.log('Evaluation: trackers loaded');
  const adapter = new IncludeAdapter();
  const video = document.createElement('video'); video.muted = true; video.src = url;
  try {
    await adapter.init();
    console.log('Evaluation: recognizer loaded');
    if (video.readyState < 1) await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Clip codec unsupported')); });
    const total = Math.min(169, Math.floor(video.duration * 30));
    const frames: number[][] = []; let missing = 0;
    for (let i = 0; i < total; i++) {
      const time = Math.min(video.duration - 0.001, (i + 0.5) / 30);
      await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.currentTime = time; });
      const h = hands.detectForVideo(video, i * 1000 / 30 + 1);
      const p = pose.detectForVideo(video, i * 1000 / 30 + 1);
      const frame = includeFrame(p.landmarks[0] ?? [], h.landmarks);
      if (!frame) missing++;
      frames.push(frame ?? Array(134).fill(NaN));
    }
    return { prediction: await adapter.predict(includeClip(frames)), frames: total, missingFrames: missing,
      duration: video.duration, scope: 'single-clip sanity check; split and signer independence not established' };
  } finally { hands.close(); pose.close(); await adapter.dispose(); video.removeAttribute('src'); video.load(); }
}
