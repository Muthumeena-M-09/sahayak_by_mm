import React, { useEffect, useRef, useState } from 'react';
import signs from './signs.json';
import { appendConfirmed, cameraError, type Prediction } from './core.ts';

const button = 'min-h-12 px-4 rounded-xl border border-strong bg-elevated text-body disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
export function ISLAssist({ language = 'en', onSubmit, onClose, disabled = false }: {
  language?: string; onSubmit: (text: string) => void; onClose: () => void; disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0), clip = useRef(0), busy = useRef(false), capturing = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const [consent, setConsent] = useState(false), [starting, setStarting] = useState(false);
  const [camera, setCamera] = useState(false), [ready, setReady] = useState(false), [recording, setRecording] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Camera is off.');
  const [candidate, setCandidate] = useState<Prediction | null>(null), [phrase, setPhrase] = useState('');
  const [lowLight, setLowLight] = useState(false);
  const display = (label: string) => { const entry = signs[label as keyof typeof signs]; return entry?.display[language as 'en' | 'hi'] || entry?.display.en || label; };
  function stopCapture() { capturing.current = false; setRecording(false); }
  function stop() {
    generation.current++; clip.current++; stopCapture();
    if (timer.current) clearInterval(timer.current);
    if (startupTimer.current) clearTimeout(startupTimer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    worker.current?.terminate(); worker.current = null; busy.current = false;
    setCamera(false); setStarting(false); setReady(false); setCandidate(null); setLowLight(false); setStatus('Camera is off.');
  }
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); stop(); };
  }, []);
  async function start() {
    if (!consent || starting || camera) return;
    setStarting(true); setError(''); setStatus('Requesting camera permission…');
    const current = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Unavailable', 'SecurityError');
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      if (current !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      media.getVideoTracks()[0].onended = () => { stop(); setError('Camera disconnected. Reconnect it and retry.'); };
      video.current!.srcObject = media; await video.current!.play();
      if (current !== generation.current) return;
      setCamera(true); setStatus('Loading local recognition models…');
      const instance = new Worker(new URL('./recognition.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      const fail = (message: string) => { if (current !== generation.current) return; stop(); setError(message); };
      instance.onerror = () => fail('Local recognition could not start. Check local model setup and browser support, or use Text/Voice.');
      instance.onmessage = ({ data }) => {
        if (current !== generation.current) return;
        if (data.type === 'status') setStatus(data.message);
        if (data.type === 'ready') { if (startupTimer.current) clearTimeout(startupTimer.current); setReady(true); setStarting(false); setStatus('Ready. Keep your upper body and both hands in view.'); }
        if (data.type === 'error') fail(`Local recognition unavailable: ${data.message}`);
        if (data.type === 'result') {
          busy.current = false;
          if (data.clip !== clip.current || !capturing.current) return;
          setLowLight(data.lowLight);
          setStatus(data.tracking ? `Reading sign · ${data.frames} frames` : 'Keep your upper body and hands visible, in good light.');
          if (data.stable) { setCandidate(data.stable); stopCapture(); setStatus('Review the suggestion. Nothing has been sent.'); }
          else if (data.finished) { stopCapture(); setStatus('Recognition is unsure. Retry or type your phrase.'); }
        }
      };
      instance.postMessage({ type: 'init' });
      startupTimer.current = setTimeout(() => fail('Local models took too long to load. Stop and retry.'), 60000);
      // One in-flight frame bounds memory and avoids blocking the UI.
      timer.current = setInterval(async () => {
        if (current !== generation.current) return;
        if (!capturing.current || busy.current || !video.current || video.current.readyState < 2) return;
        if (performance.now() > deadline.current) { stopCapture(); setStatus('Recognition is unsure. Retry or type your phrase.'); return; }
        busy.current = true;
        const activeClip = clip.current;
        try {
          const bitmap = await createImageBitmap(video.current);
          if (current !== generation.current || !capturing.current || activeClip !== clip.current) { bitmap.close(); busy.current = false; return; }
          instance.postMessage({ type: 'frame', clip: activeClip, timestamp: performance.now(), bitmap }, [bitmap]);
        } catch { fail('This browser cannot process camera frames locally. Use Text/Voice.'); }
      }, 33);
    } catch (e) {
      if (current !== generation.current) return;
      stop(); setError(cameraError(e instanceof Error ? e.name : ''));
    }
  }
  function retry() {
    clip.current++; worker.current?.postMessage({ type: 'reset', clip: clip.current });
    setCandidate(null); setLowLight(false); setError(''); setStatus('Sign one word now.');
    deadline.current = performance.now() + 10000; capturing.current = true; setRecording(true);
  }
  return <section aria-label="Sahayak ISL Assist" lang="en" className="p-4 space-y-3 bg-card border border-strong rounded-2xl max-h-[75vh] overflow-y-auto">
    <h2 className="text-xl font-bold text-body">Sahayak ISL Assist · Experimental</h2>
    <p className="text-body">Try one supported ISL word at a time. Recognition accuracy with real users is not yet measured. Check every suggestion.</p>
    <p className="text-sm text-muted">Video and landmarks stay on this device and are discarded when stopped. Only the phrase you explicitly submit is sent to Sahayak. No audio is captured.</p>
    <label className="flex gap-3 items-center text-body min-h-12"><input type="checkbox" checked={consent} disabled={camera || starting} onChange={e => setConsent(e.target.checked)} />I agree to local camera processing for this experimental test.</label>
    <video ref={video} muted playsInline aria-label="Mirrored camera preview" className={`w-full max-h-64 object-contain bg-black rounded-xl ${camera ? '' : 'hidden'}`} style={{ transform: 'scaleX(-1)' }} />
    <p role="status" aria-live="polite" className="text-body">{camera ? '● Camera is on — ' : ''}{status}</p>
    {lowLight && <p role="status" className="font-bold text-body">Low light. Move to a brighter place.</p>}
    {error && <p role="alert" className="font-semibold text-body">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={!consent || starting || camera} onClick={start}>{starting ? 'Starting…' : 'Start camera'}</button>
      <button type="button" className={button} disabled={!camera && !starting} onClick={stop}>Stop camera</button>
      <button type="button" className={button} disabled={!ready || recording || disabled} onClick={retry}>Sign a word / Retry</button>
    </div>
    {candidate && <div className="p-3 border border-strong rounded-xl space-y-2 text-body">
      <p>Suggestion: <strong>{display(candidate.label)}</strong> · model confidence {Math.round(candidate.confidence * 100)}% (uncalibrated)</p>
      <button type="button" className={button} onClick={() => { setPhrase(p => appendConfirmed(p, display(candidate.label))); setCandidate(null); }}>Confirm word</button>{' '}
      <button type="button" className={button} onClick={() => { setPhrase(p => appendConfirmed(p, display(candidate.label))); setCandidate(null); document.getElementById('isl-phrase')?.focus(); }}>Edit suggestion</button>
    </div>}
    <label className="block text-body font-semibold" htmlFor="isl-phrase">Review or edit your phrase</label>
    <textarea id="isl-phrase" value={phrase} maxLength={500} onChange={e => setPhrase(e.target.value)} className="w-full min-h-24 p-3 bg-elevated text-body border border-strong rounded-xl" />
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!phrase.trim() || disabled || recording} className={button} onClick={() => { const text = phrase.trim(); if (text && !disabled && !recording) { stop(); onSubmit(text); setPhrase(''); } }}>Confirm and send phrase</button>
      <button type="button" className={button} onClick={() => { stopCapture(); setCandidate(null); setPhrase(''); clip.current++; }}>Clear phrase</button>
      <button type="button" className={button} onClick={() => { stop(); onClose(); }}>Use Text / Voice</button>
    </div>
    <details className="text-body"><summary className="min-h-12 cursor-pointer font-semibold">Supported signs for testing ({Object.keys(signs).length})</summary><p>{Object.keys(signs).map(display).join(' · ')}</p><p className="text-sm text-muted">Word labels come from INCLUDE. Regional variants and this prototype need review by ISL users. No sentence translation.</p></details>
  </section>;
}
