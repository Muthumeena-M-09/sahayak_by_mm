import {useEffect,useRef,useState} from 'react';
import type {ModelManifest} from '../lib/isl/recognizer.ts';
import {preprocess,TemporalBuffer} from '../lib/isl/preprocessing.ts';
import {PredictionSmoother,type Prediction} from '../lib/isl/smoothing.ts';

export function useISLRecognition(video: HTMLVideoElement|null, manifest:ModelManifest|null, enabled:boolean) {
  const [status,setStatus]=useState('idle'), [prediction,setPrediction]=useState<Prediction|null>(null), [error,setError]=useState('');
  const resetRef=useRef<()=>void>(()=>{});
  useEffect(()=>{
    if(!video || !manifest || !enabled || !manifest.recognitionEnabled) return;
    let cancelled=false, timer:ReturnType<typeof setTimeout>, worker:Worker|null=null;
    let holistic:import('@mediapipe/holistic').Holistic|null=null, ready=false, pending=false, nextId=0;
    let workerReady=false, landmarksReady=false, failed=false;
    const becomeReady=()=>{if(!cancelled && !failed && workerReady && landmarksReady){ready=true;setStatus('ready');}};
    const buffer=new TemporalBuffer(), smooth=new PredictionSmoother(manifest.labels,manifest.threshold,2);
    resetRef.current=()=>{buffer.clear(); smooth.reset(); setPrediction(null);setError('');};
    setStatus('loading');setError('');
    const fail=(message:string)=>{failed=true;if(!cancelled){setError(message);setStatus('error');} ready=false;};
    void(async()=>{
      try {
        worker=new Worker(new URL('../workers/isl.worker.ts',import.meta.url),{type:'module'});
        worker.onerror=()=>fail('Local inference worker failed. Stop and restart the camera to retry.');
        worker.onmessage=(event)=>{
          if(cancelled)return;
          pending=false;
          if(event.data.error){fail(event.data.error);return;}
          if(event.data.ready){workerReady=true;becomeReady();}
          if(event.data.prediction){
            const candidate=smooth.update(event.data.prediction);
            if(candidate)setPrediction(candidate);
            else setStatus('unsure');
          }
        };
        worker.postMessage({id:++nextId,type:'init',manifest});
        const module=await import('@mediapipe/holistic');
        if(cancelled)return;
        const HolisticConstructor=module.Holistic || (module as unknown as {default:typeof module}).default?.Holistic ||
          (globalThis as unknown as {Holistic?:typeof module.Holistic}).Holistic;
        if(!HolisticConstructor)throw new Error('The local landmark library could not load.');
        holistic=new HolisticConstructor({locateFile:file=>`/mediapipe/holistic/${file}`});
        await holistic.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,refineFaceLandmarks:false,minDetectionConfidence:.5,minTrackingConfidence:.5});
        holistic.onResults(results=>{
          if(cancelled || !ready || pending)return;
          const frame=new Float32Array(225);
          const parts:[[typeof results.poseLandmarks,number],[typeof results.leftHandLandmarks,number],[typeof results.rightHandLandmarks,number]]=
            [[results.poseLandmarks,0],[results.leftHandLandmarks,33],[results.rightHandLandmarks,54]];
          for(const [landmarks,offset] of parts)landmarks?.forEach((point,i)=>{
            if(offset===0 && (point.visibility??1)<.5)return;
            frame.set([point.x,point.y,point.z],(offset+i)*3);
          });
          try {
            if(!results.poseLandmarks || (!results.leftHandLandmarks && !results.rightHandLandmarks)) {buffer.clear();smooth.reset();setStatus('unsure');return;}
            buffer.push(frame);
            if(buffer.length===32){
              const sequence=preprocess(buffer.snapshot());
              pending=true;worker?.postMessage({id:++nextId,type:'predict',sequence},[sequence.buffer]);
            }
          }catch{buffer.clear();smooth.reset();setStatus('unsure');}
        });
        await holistic.initialize();
        landmarksReady=true;becomeReady();
        const sample=async()=>{
          if(cancelled)return;
          try{if(ready && !pending && video.readyState>=2)await holistic?.send({image:video});}
          catch(error){fail(error instanceof Error?error.message:'Landmark processing failed.');}
          if(!cancelled)timer=setTimeout(sample,67);
        };
        void sample();
      }catch(error){fail(error instanceof Error?error.message:'Model initialization failed.');}
    })();
    return ()=>{cancelled=true;clearTimeout(timer);worker?.terminate();void holistic?.close();buffer.clear();setPrediction(null);setStatus('idle');};
  },[video,manifest,enabled]);
  return {status,prediction,error,reset:()=>resetRef.current()};
}
