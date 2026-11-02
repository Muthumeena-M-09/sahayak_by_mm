import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { IncludeAdapter } from './adapter.ts';
import { includeClip, includeFrame, PredictionSmoother } from './core.ts';
import signs from './signs.json';

const adapter = new IncludeAdapter();
const smoother = new PredictionSmoother(new Set(Object.keys(signs)));
let hands: HandLandmarker, pose: PoseLandmarker;
let frames: number[][] = [], clip = 0;
const send = (value: unknown) => self.postMessage(value);
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      send({ type: 'status', message: 'Loading hand tracking…' });
      const wasm = await FilesetResolver.forVisionTasks(`${self.location.origin}/isl/mediapipe`, true);
      // The Tasks loader clears ModuleFactory after creation, whereas ES modules
      // are cached. Restore the exported factory for each independent task.
      const loader = await import(/* @vite-ignore */ wasm.wasmLoaderPath);
      (self as unknown as { ModuleFactory: unknown }).ModuleFactory = loader.default;
      hands = await HandLandmarker.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: '/isl/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2,
      });
      (self as unknown as { ModuleFactory: unknown }).ModuleFactory = loader.default;
      send({ type: 'status', message: 'Loading upper-body tracking…' });
      pose = await PoseLandmarker.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: '/isl/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1,
      });
      send({ type: 'status', message: 'Loading sign recognition…' });
      await adapter.init();
      send({ type: 'ready' });
    } else if (data.type === 'reset') {
      frames = []; clip = data.clip; smoother.reset();
    } else if (data.type === 'frame') {
      const bitmap: ImageBitmap = data.bitmap;
      try {
        if (data.clip !== clip) return;
        const canvas = new OffscreenCanvas(32, 24);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0, 32, 24);
        const pixels = context.getImageData(0, 0, 32, 24).data;
        let brightness = 0;
        for (let i = 0; i < pixels.length; i += 4) brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        const lowLight = brightness / (32 * 24) < 40;
        const handResult = hands.detectForVideo(bitmap, data.timestamp);
        const poseResult = pose.detectForVideo(bitmap, data.timestamp);
        const frame = includeFrame(poseResult.landmarks[0] ?? [], handResult.landmarks);
        if (!frame || lowLight) {
          smoother.reset();
          // Restart rather than silently deleting missing time from a gesture.
          frames = [];
          send({ type: 'result', clip, lowLight, tracking: false, frames: 0, stable: null });
          return;
        }
        frames.push(frame);
        let stable = null;
        const requestClip = data.clip;
        if (frames.length >= 15 && frames.length % 5 === 0) {
          const prediction = await adapter.predict(includeClip(frames));
          if (requestClip !== clip) return;
          stable = smoother.push(prediction);
        }
        send({ type: 'result', clip: requestClip, lowLight, tracking: true, frames: frames.length, stable,
          finished: frames.length >= 169 });
      } finally { bitmap.close(); }
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Local recognition failed.' });
  }
};
