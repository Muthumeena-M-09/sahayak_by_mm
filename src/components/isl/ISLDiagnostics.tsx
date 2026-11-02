import React from 'react';
import type {RecognitionDiagnostics} from '../../lib/isl/pipeline.ts';
import {displaySign} from '../../lib/isl/signs.ts';

export function ISLDiagnostics({cameraRequested,video,status,diagnostics,reason,error,language,featureFlag,manifestEnabled}:{
  cameraRequested:boolean;video:HTMLVideoElement|null;status:string;diagnostics:RecognitionDiagnostics|null;
  reason:string;error:string;language:string;featureFlag:string|undefined;manifestEnabled:boolean|undefined;
}){
  const yes=(value:boolean|undefined)=>value?'detected':'not detected';
  const raw=diagnostics?.raw;
  return <aside aria-label="Recognition diagnostics" className="p-3 rounded-xl border border-strong text-sm space-y-2">
    <h3 className="font-semibold">Local recognition diagnostics</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-words">
      <dt>Camera</dt><dd data-testid="diagnostic-camera">{video?`On — ${video.videoWidth} × ${video.videoHeight}`:cameraRequested?'Starting / permission pending or failed':'Off'}</dd>
      <dt>Mode</dt><dd>{reason}</dd>
      <dt>Existing feature flag</dt><dd>VITE_ENABLE_ISL_ASSIST: {featureFlag??'unset'}</dd>
      <dt>Model quality gate</dt><dd>{manifestEnabled?'enabled':'disabled'} (unchanged by testing)</dd>
      <dt>Pipeline</dt><dd>{status}</dd>
      <dt>ONNX worker</dt><dd data-testid="diagnostic-worker">{diagnostics?.workerReady?'ready':'not ready'}</dd>
      <dt>MediaPipe</dt><dd>{diagnostics?.landmarksReady?'ready':'not ready'}</dd>
      <dt>Landmark callbacks</dt><dd data-testid="diagnostic-callbacks">{diagnostics?.callbacks??0}</dd>
      <dt>Body / shoulders</dt><dd>{yes(diagnostics?.pose)} / {yes(diagnostics?.shoulders)}</dd>
      <dt>Left / right hand</dt><dd>{yes(diagnostics?.leftHand)} / {yes(diagnostics?.rightHand)}</dd>
      <dt>Temporal buffer</dt><dd data-testid="diagnostic-buffer">{diagnostics?.bufferFrames??0} / 32 valid frames</dd>
      <dt>ONNX input</dt><dd>{diagnostics?.inputShape??'Not submitted'}; finite: {diagnostics?.inputFinite==null?'not checked':String(diagnostics.inputFinite)}</dd>
      <dt>Requests / results</dt><dd>{diagnostics?.requests??0} / {diagnostics?.responses??0}</dd>
      <dt>Raw model prediction</dt><dd data-testid="diagnostic-prediction">{raw?`${displaySign(raw.label,language)} (${raw.label})`:'No prediction yet'}</dd>
      <dt>Confidence</dt><dd>{raw?`${(raw.confidence*100).toFixed(1)}% (uncalibrated model score)`:'—'}</dd>
      <dt>Safeguards</dt><dd>{((diagnostics?.threshold??.85)*100).toFixed(1)}% minimum; {diagnostics?.consecutive??0}/{diagnostics?.required??2} consistent windows</dd>
      <dt>Current stage / rejection</dt><dd data-testid="diagnostic-reason">{error||diagnostics?.reason||reason}</dd>
      <dt>Last prediction decision</dt><dd>{diagnostics?.filterReason??'No prediction yet.'}</dd>
    </dl>
    <p>Raw predictions above do not bypass safeguards or fill Review word. Only accepted predictions enter review. No text is sent automatically.</p>
  </aside>;
}
