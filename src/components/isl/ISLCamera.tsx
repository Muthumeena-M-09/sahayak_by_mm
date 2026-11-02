import React, {useEffect, useRef, useState} from 'react';
import {islMessages} from '../../lib/isl/messages.ts';

export function cameraErrorCode(error: unknown): 'denied'|'missing'|'busy'|'failed' {
  const name = (error as {name?: string})?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' :
    name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' :
    name === 'NotReadableError' || name === 'AbortError' ? 'busy' : 'failed';
}
export function ISLCamera({active, language, onVideo, onStop}: {
  active: boolean; language: string; onVideo:(video: HTMLVideoElement|null)=>void; onStop:()=>void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false), [error,setError] = useState(''), [dark,setDark] = useState(false);
  const text = islMessages(language);
  useEffect(()=>{
    if (!active) return;
    let cancelled = false, stream: MediaStream|null = null;
    const stop = () => { stream?.getTracks().forEach(track=>track.stop()); onVideo(null); };
    setError(''); setDark(false);
    void (async()=>{
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
        const obtained = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
        if (cancelled) { obtained.getTracks().forEach(track=>track.stop()); return; }
        stream = obtained;
        const element = video.current!;
        element.srcObject = stream;
        await element.play();
        if (cancelled) { stop(); return; }
        setOn(true); onVideo(element);
        stream.getVideoTracks().forEach(track=>track.addEventListener('ended',onStop,{once:true}));
      } catch(error) { stop(); if(!cancelled) {setError(cameraErrorCode(error)); setOn(false);} }
    })();
    const visibility = () => { if(document.hidden) onStop(); };
    document.addEventListener('visibilitychange',visibility);
    const canvas = document.createElement('canvas'); canvas.width=32; canvas.height=24;
    const timer = setInterval(()=>{
      if (!video.current?.videoWidth || !stream?.active) return;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)return;
      ctx.drawImage(video.current,0,0,32,24);
      const bytes=ctx.getImageData(0,0,32,24).data;
      let luminance=0; for(let i=0;i<bytes.length;i+=4)luminance+=.2126*bytes[i]+.7152*bytes[i+1]+.0722*bytes[i+2];
      setDark(luminance/(bytes.length/4)<35);
    },1500);
    return ()=>{cancelled=true; clearInterval(timer); document.removeEventListener('visibilitychange',visibility); stop();
      if(video.current) video.current.srcObject=null; setOn(false);};
  },[active,onVideo,onStop]);
  return <div className="space-y-2">
    <p role="status" className="font-semibold">{on ? `● ${text.on}` : text.off}</p>
    <video ref={video} autoPlay muted playsInline aria-label="Mirrored camera preview" className="w-full max-h-56 rounded-xl border border-strong bg-elevated object-contain" style={{transform:'scaleX(-1)'}} />
    {error && <p role="alert">{text[error as 'failed']}</p>}
    {dark && <p role="status">{text.lowlight}</p>}
  </div>;
}
