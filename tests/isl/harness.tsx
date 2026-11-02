import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ISLAssist} from '../../src/components/isl/ISLAssist.tsx';
import {OnnxRecognizer,validateManifest} from '../../src/lib/isl/recognizer.ts';
import {preprocess} from '../../src/lib/isl/preprocessing.ts';
import {confirmedISLPayload} from '../../src/lib/isl/chat.ts';
import {ISLCamera} from '../../src/components/isl/ISLCamera.tsx';
import {useISLRecognition} from '../../src/hooks/useISLRecognition.ts';
import {AppProvider} from '../../src/context/AppContext.tsx';
import {CitizenAskScreen} from '../../src/components/CitizenAskAndExplain.tsx';
import '../../src/index.css';
function Harness(){
  const [open,setOpen]=useState(true),[draft,setDraft]=useState('');
  return <main className="max-w-xl m-auto"><button onClick={()=>setOpen(true)}>Open ISL</button>
    {open && <ISLAssist language="en" onClose={()=>setOpen(false)} onDraft={value=>{setDraft(value);setOpen(false);}}/>}
    <label>Chat draft<input value={draft} onChange={e=>setDraft(e.target.value)}/></label>
    <button onClick={()=>fetch('/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(confirmedISLPayload(draft,'ta',12))})}>Send reviewed chat</button>
  </main>;
}
// Test-only runtime probe: real model/extractor, synthetic camera, never a claimed ISL accuracy test.
function LiveProbe(){
  const [active,setActive]=useState(false),[video,setVideo]=useState<HTMLVideoElement|null>(null),[manifest,setManifest]=useState<any>(null);
  const stop=useCallback(()=>setActive(false),[]),onVideo=useCallback((v:HTMLVideoElement|null)=>setVideo(v),[]);
  useEffect(()=>{void fetch('/models/isl/manifest.json').then(r=>r.json()).then(value=>setManifest({...value,recognitionEnabled:true}));},[]);
  const recognition=useISLRecognition(video,manifest,true);
  return <><button onClick={()=>setActive(true)}>Probe local extraction</button>
    {active && <ISLCamera active={active} language="en" onVideo={onVideo} onStop={stop}/>}
    <p data-testid="probe-status">{recognition.status}</p><p data-testid="probe-error">{recognition.error}</p></>;
}
const query=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(query.has('chat')?
  <AppProvider><CitizenAskScreen onStartService={()=>{}} onNavigate={()=>{}}/></AppProvider>:
  query.has('live')?<LiveProbe/>:<Harness/>);
(window as any).islAudit={preprocess: (frames:number[][])=>Array.from(preprocess(frames.map(frame=>new Float32Array(frame)))),
  async batch(samples:number[][]){
    const manifest=validateManifest(await(await fetch('/models/isl/manifest.json')).json());
    const adapter=new OnnxRecognizer();const start=performance.now();await adapter.init(manifest);
    const loadMs=performance.now()-start, outputs=[];
    for(const sample of samples){const t=performance.now();const logits=await adapter.predictLogits(new Float32Array(sample));outputs.push({logits,elapsedMs:performance.now()-t});}
    await adapter.dispose();return {loadMs,outputs};
  },
  async predict(x:number[]){
    const manifest=validateManifest(await (await fetch('/models/isl/manifest.json')).json());
    const adapter=new OnnxRecognizer();await adapter.init(manifest);const start=performance.now();
    const prediction=await adapter.predict(new Float32Array(x));await adapter.dispose();
    return {prediction,elapsedMs:performance.now()-start};
  },
  async workerPredict(x:number[]){
    const manifest=await (await fetch('/models/isl/manifest.json')).json();
    const worker=new Worker(new URL('../../src/workers/isl.worker.ts',import.meta.url),{type:'module'});
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.terminate();reject(new Error('Worker timed out'));},45000);
      worker.onmessage=event=>{if(event.data.error){clearTimeout(timer);worker.terminate();reject(new Error(event.data.error));}
        else if(event.data.id===1)worker.postMessage({id:2,type:'predict',sequence:new Float32Array(x)});
        else {clearTimeout(timer);worker.terminate();resolve(event.data.prediction);}};
      worker.postMessage({id:1,type:'init',manifest});
    });
  }
};
