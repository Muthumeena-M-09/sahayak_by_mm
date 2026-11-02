import {TemporalBuffer,preprocess,type LandmarkFrame} from './preprocessing.ts';
import {PredictionSmoother,type Prediction} from './smoothing.ts';

/** Diagnostics contain counts/status only. Coordinates remain in memory. */
export interface RecognitionDiagnostics {
  callbacks:number; pose:boolean; leftHand:boolean; rightHand:boolean; shoulders:boolean;
  bufferFrames:number; inputShape:string; inputFinite:boolean|null;
  requests:number; responses:number; raw:Prediction|null; consecutive:number; required:number;
  threshold:number; reason:string; filterReason:string; workerReady:boolean; landmarksReady:boolean;
}
export class RecognitionPipeline {
  private buffer=new TemporalBuffer();
  private smooth:PredictionSmoother;
  private lastValidAt:number|null=null;
  private state:RecognitionDiagnostics;
  constructor(labels:readonly string[],threshold:number,windows=2){
    this.smooth=new PredictionSmoother(labels,threshold,windows);
    this.state={callbacks:0,pose:false,leftHand:false,rightHand:false,shoulders:false,
      bufferFrames:0,inputShape:'Not submitted',inputFinite:null,requests:0,responses:0,raw:null,
      consecutive:0,required:windows,threshold,reason:'Waiting for landmarks.',filterReason:'No prediction yet.',workerReady:false,landmarksReady:false};
  }
  get diagnostics():RecognitionDiagnostics {return {...this.state,raw:this.state.raw?{...this.state.raw}:null};}
  readiness(workerReady:boolean,landmarksReady:boolean){this.state.workerReady=workerReady;this.state.landmarksReady=landmarksReady;}
  frame(frame:LandmarkFrame,now=performance.now()):Float32Array|null {
    this.state.callbacks++;
    if(this.lastValidAt!==null && now-this.lastValidAt>1500){
      this.buffer.clear();this.smooth.reset();this.state.bufferFrames=0;this.state.consecutive=0;this.lastValidAt=null;
    }
    if(frame.length!==225 || !frame.every(Number.isFinite)){
      this.buffer.clear();this.smooth.reset();this.state.bufferFrames=0;this.state.inputFinite=false;
      this.state.reason='Invalid landmark frame.';return null;
    }
    this.state.pose=frame.slice(0,99).some(v=>v!==0);
    this.state.leftHand=frame.slice(99,162).some(v=>v!==0);
    this.state.rightHand=frame.slice(162).some(v=>v!==0);
    this.state.shoulders=frame.slice(33,36).some(v=>v!==0) && frame.slice(36,39).some(v=>v!==0) &&
      Math.hypot(frame[33]-frame[36],frame[34]-frame[37])>=.001;
    if(!this.state.pose || !this.state.shoulders || (!this.state.leftHand&&!this.state.rightHand)){
      // A brief detection dropout must not erase every prior valid frame. Skip
      // it; never duplicate/invent landmarks. Long gaps above reset the window.
      this.smooth.reset();this.state.bufferFrames=this.buffer.length;this.state.consecutive=0;
      this.state.reason=!this.state.pose?'No body landmarks detected.':!this.state.shoulders?
        'Both shoulders must be visible.':'No hand landmarks detected. Show at least one hand.';
      return null;
    }
    this.lastValidAt=now;this.buffer.push(frame);this.state.bufferFrames=this.buffer.length;
    if(this.buffer.length<32){this.state.reason=`Collecting valid frames: ${this.buffer.length}/32.`;return null;}
    try {
      const sequence=preprocess(this.buffer.snapshot());
      this.state.inputFinite=sequence.every(Number.isFinite);
      if(!this.state.inputFinite)throw new Error('Nonfinite normalized landmarks.');
      this.state.inputShape='[1, 32, 225]';this.state.requests++;this.state.reason='Waiting for ONNX prediction.';
      return sequence;
    }catch(error){this.buffer.clear();this.smooth.reset();this.state.bufferFrames=0;this.state.reason=(error as Error).message;return null;}
  }
  prediction(raw:Prediction):Prediction|null {
    this.state.responses++;this.state.raw=raw;
    const accepted=this.smooth.update(raw);
    this.state.reason=this.smooth.diagnostics.reason;this.state.filterReason=this.state.reason;this.state.consecutive=this.smooth.diagnostics.consecutive;
    return accepted;
  }
  reset(){this.buffer.clear();this.smooth.reset();this.lastValidAt=null;this.state.bufferFrames=0;this.state.raw=null;
    this.state.consecutive=0;this.state.inputShape='Not submitted';this.state.inputFinite=null;this.state.filterReason='No prediction yet.';this.state.reason='Retry: waiting for 32 new valid frames.';}
}
