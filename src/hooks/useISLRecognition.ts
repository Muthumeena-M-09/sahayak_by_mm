import {useEffect,useRef,useState} from 'react';
import type {ModelManifest} from '../lib/isl/recognizer.ts';
import {RecognitionPipeline,type RecognitionDiagnostics} from '../lib/isl/pipeline.ts';
import {experimentalRecognitionMode} from '../lib/isl/development.ts';
import type {Prediction} from '../lib/isl/smoothing.ts';

export function useISLRecognition(video: HTMLVideoElement|null, manifest:ModelManifest|null, experimentalEnabled:boolean) {
  const [status,setStatus]=useState('idle'), [prediction,setPrediction]=useState<Prediction|null>(null), [error,setError]=useState('');
  const [diagnostics,setDiagnostics]=useState<RecognitionDiagnostics|null>(null);
  const resetRef=useRef<()=>void>(()=>{});
  const mode=experimentalRecognitionMode(import.meta.env.DEV,globalThis.location.hostname,experimentalEnabled);
  useEffect(()=>{
    if(!video || !manifest || !mode.active){setStatus('idle');setPrediction(null);setDiagnostics(null);setError('');return;}
    let cancelled=false, timer:ReturnType<typeof setTimeout>, worker:Worker|null=null;
    let holistic:import('@mediapipe/holistic').Holistic|null=null, ready=false, pending=false, nextId=0;
    let workerReady=false, landmarksReady=false, failed=false;
    const pipeline=new RecognitionPipeline(manifest.labels,manifest.threshold,2);
    const publish=()=>{if(!cancelled){pipeline.readiness(workerReady,landmarksReady);setDiagnostics(pipeline.diagnostics);}};
    const becomeReady=()=>{if(!cancelled && !failed && workerReady && landmarksReady){ready=true;setStatus('ready');}publish();};
    let ignoreThrough=0;
    resetRef.current=()=>{ignoreThrough=nextId;pipeline.reset();setPrediction(null);publish();};
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
          if(event.data.prediction && event.data.id>ignoreThrough){
            const candidate=pipeline.prediction(event.data.prediction);
            if(candidate){setPrediction(candidate);setStatus('ready');}
            else setStatus('unsure');
            publish();
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
          const sequence=pipeline.frame(frame);
          if(sequence){pending=true;worker?.postMessage({id:++nextId,type:'predict',sequence},[sequence.buffer]);}
          else setStatus('collecting');
          publish();
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
    return ()=>{cancelled=true;clearTimeout(timer);worker?.terminate();void holistic?.close();pipeline.reset();resetRef.current=()=>{};setPrediction(null);setStatus('idle');};
  },[video,manifest,mode.active]);
  return {status,prediction,error,diagnostics,gateReason:mode.reason,reset:()=>resetRef.current()};
}
