import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ISLCamera} from './ISLCamera.tsx';
import {validateManifest,type ModelManifest} from '../../lib/isl/recognizer.ts';
import {displaySign} from '../../lib/isl/signs.ts';
import {confirmWord} from '../../lib/isl/smoothing.ts';
import {islMessages} from '../../lib/isl/messages.ts';
import {useISLRecognition} from '../../hooks/useISLRecognition.ts';

export function ISLAssist({language,onDraft,onClose}: {language:string;onDraft:(phrase:string)=>void;onClose:()=>void}) {
  const [active,setActive]=useState(false),[video,setVideo]=useState<HTMLVideoElement|null>(null);
  const [manifest,setManifest]=useState<ModelManifest|null>(null),[modelError,setModelError]=useState('');
  const [word,setWord]=useState(''),[phrase,setPhrase]=useState('');
  const input=useRef<HTMLInputElement>(null),text=islMessages(language);
  const enabled=import.meta.env.VITE_ENABLE_ISL_ASSIST==='true';
  const stop=useCallback(()=>setActive(false),[]);
  const onVideo=useCallback((element:HTMLVideoElement|null)=>setVideo(element),[]);
  const recognition=useISLRecognition(video,manifest,enabled);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/models/isl/manifest.json',{signal:controller.signal,cache:'no-cache'})
      .then(async response=>{if(!response.ok)throw new Error('ISL model manifest is missing.');return validateManifest(await response.json());})
      .then(setManifest).catch(error=>{if(error.name!=='AbortError')setModelError(error.message);});
    return()=>controller.abort();
  },[]);
  useEffect(()=>{if(recognition.prediction)setWord(displaySign(recognition.prediction.label,language));},[recognition.prediction,language]);
  const clear=()=>{setPhrase('');setWord('');recognition.reset();};
  return <section aria-label={text.title} className="p-4 border-b border-hairline bg-card text-body space-y-3 max-h-[60vh] overflow-y-auto">
    <div className="flex justify-between gap-3 items-center"><h2 className="font-display font-bold">{text.title}</h2>
      <button type="button" onClick={()=>{stop();onClose();}} className="min-h-11 px-3 border rounded-xl">{text.fallback}</button></div>
    <p className="text-sm">{text.consent}</p>
    {(!enabled || !manifest?.recognitionEnabled) && <p role="status" className="p-3 border border-strong rounded-xl text-sm">{text.disabled}{manifest?.disabledReason && ` ${manifest.disabledReason}`}</p>}
    {modelError && <p role="alert">{modelError}</p>}
    <button type="button" onClick={()=>setActive(value=>!value)} className="min-h-12 px-4 bg-primary text-on-primary rounded-xl">{active?text.stop:text.start}</button>
    {active && <ISLCamera active={active} language={language} onVideo={onVideo} onStop={stop}/>}
    <p role="status" aria-live="polite">{recognition.status==='loading'?text.loading:recognition.status==='ready'?text.ready:recognition.status==='unsure'?text.unsure:''}</p>
    {recognition.error && <p role="alert">{recognition.error}</p>}
    {recognition.prediction && <p>{displaySign(recognition.prediction.label,language)} · {Math.round(recognition.prediction.confidence*100)}% <span className="text-sm">(model score)</span></p>}
    <label className="block">{text.word}<input ref={input} value={word} maxLength={200} onChange={event=>setWord(event.target.value)} className="block w-full min-h-12 px-3 border border-strong rounded-xl bg-elevated"/></label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!word.trim()} onClick={()=>{try{setPhrase(confirmWord(phrase,word));setWord('');recognition.reset();}catch(error){setModelError((error as Error).message);}}} className="min-h-11 px-3 border rounded-xl disabled:opacity-50">{text.confirm}</button>
      <button type="button" onClick={()=>{if(recognition.error)stop();setWord('');recognition.reset();}} className="min-h-11 px-3 border rounded-xl">{text.retry}</button>
      <button type="button" onClick={()=>input.current?.focus()} className="min-h-11 px-3 border rounded-xl">{text.edit}</button>
      <button type="button" onClick={clear} className="min-h-11 px-3 border rounded-xl">{text.clear}</button>
    </div>
    <label className="block">{text.phrase}<textarea aria-label={text.phrase} value={phrase} maxLength={1000} onChange={event=>setPhrase(event.target.value)} className="block w-full min-h-20 p-3 border border-strong rounded-xl bg-elevated"/></label>
    <button type="button" disabled={!phrase.trim()} onClick={()=>{stop();onDraft(phrase.trim());}} className="min-h-12 px-4 bg-primary text-on-primary rounded-xl disabled:opacity-50">{text.draft}</button>
    <details><summary className="min-h-11 cursor-pointer">{text.vocabulary}</summary>
      <p className="text-sm">Isolated words only. No sentence translation. These labels require validation before live use.</p>
      <ul className="flex flex-wrap gap-3">{manifest?.labels.map(label=><li key={label}>{displaySign(label,language)}</li>)}</ul>
    </details>
  </section>;
}
