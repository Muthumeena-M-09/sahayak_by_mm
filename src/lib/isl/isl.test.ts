import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preprocess,TemporalBuffer} from './preprocessing.ts';
import {PredictionSmoother,confirmWord} from './smoothing.ts';
import {validateLabels,displaySign} from './signs.ts';
import {OnnxRecognizer,validateManifest} from './recognizer.ts';
import {confirmedISLPayload,validateISLChatBody} from './chat.ts';
import {experimentalRecognitionMode} from './development.ts';
import {RecognitionPipeline} from './pipeline.ts';

function frame(){const f=new Float32Array(225);f.set([.3,.4,.1],33);f.set([.7,.4,.1],36);f.set([.2,.2,.1],99);return f;}
test('temporal buffer bounds, copies and resets sequences',()=>{
  const b=new TemporalBuffer(32);const f=frame();for(let i=0;i<40;i++)b.push(f);
  f[0]=999;assert.equal(b.length,32);assert.equal(b.snapshot()[0][0],0);b.clear();assert.equal(b.length,0);
  assert.throws(()=>b.push(new Float32Array(3)));
});
test('preprocessing rejects absent shoulders and preserves missing points',()=>{
  assert.throws(()=>preprocess([new Float32Array(225),new Float32Array(225)]));
  const x=preprocess([frame(),frame()]);assert.equal(x.length,7200);assert.ok(x.every(Number.isFinite));
  assert.equal(x[0],0);assert.ok(Math.abs(x[33]+.5)<1e-5);assert.ok(Math.abs(x[36]-.5)<1e-5);
});
test('smoothing filters low confidence, invalid classes, NaNs and duplicates',()=>{
  const smoother=new PredictionSmoother(['48.Hello'],.85,2);
  assert.equal(smoother.update({label:'48.Hello',confidence:.6}),null);
  assert.equal(smoother.update({label:'48.Hello',confidence:.9}),null);
  assert.equal(smoother.update({label:'48.Hello',confidence:.95})?.label,'48.Hello');
  assert.equal(smoother.update({label:'48.Hello',confidence:.95}),null);
  smoother.reset();assert.equal(smoother.update({label:'ASL',confidence:1}),null);
  assert.equal(smoother.update({label:'48.Hello',confidence:NaN}),null);
});
test('confirmation builds reviewed phrases without implicit sends',()=>{
  assert.equal(confirmWord('Hello',' School '),'Hello School');assert.throws(()=>confirmWord('',' '));
  assert.throws(()=>confirmWord('x'.repeat(1000),'School'));
});
test('only verified source labels are displayable',()=>{
  validateLabels(['48.Hello']);assert.equal(displaySign('48.Hello','ta'),'வணக்கம்');
  assert.throws(()=>validateLabels(['help']));assert.throws(()=>validateLabels(['48.Hello','48.Hello']));
});
test('adapter rejects uninitialized predictions and corrupt manifests',async()=>{
  const adapter=new OnnxRecognizer();await assert.rejects(adapter.predict(new Float32Array(7200)),/not ready/);
  assert.throws(()=>validateManifest({language:'ASL'}));await adapter.dispose();assert.equal(adapter.status,'disposed');
});
test('chat payload contains only reviewed text, language, conversation and mode',()=>{
  const body=confirmedISLPayload(' School ','ta',12);
  assert.deepEqual(body,{message:'School',preferredLanguageCode:'ta',conversationId:12,input_mode:'isl'});
  assert.equal(validateISLChatBody(body),null);
  assert.match(validateISLChatBody({...body,landmarks:[1,2]})!,/text only/);
  assert.match(validateISLChatBody({...body,attachment:{base64Data:'camera'}})!,/text only/);
  assert.equal(validateISLChatBody({message:'existing text',attachment:{}}),null);
});
test('experimental recognition requires explicit activation on a loopback development server',()=>{
  for(const hostname of ['localhost','127.0.0.1','[::1]']){
    assert.equal(experimentalRecognitionMode(true,hostname,false).active,false);
    assert.equal(experimentalRecognitionMode(true,hostname,true).active,true);
    assert.equal(experimentalRecognitionMode(false,hostname,true).available,false);
  }
  for(const hostname of ['192.168.1.12','example.com','localhost.example.com']){
    assert.equal(experimentalRecognitionMode(true,hostname,true).available,false);
  }
});
test('diagnostic pipeline submits only a full valid tensor and explains missing landmarks',()=>{
  const pipeline=new RecognitionPipeline(['48.Hello'],.85);
  assert.equal(pipeline.frame(new Float32Array(225)),null);
  assert.match(pipeline.diagnostics.reason,/No body/);
  for(let i=0;i<31;i++)assert.equal(pipeline.frame(frame()),null);
  assert.equal(pipeline.diagnostics.bufferFrames,31);
  const sequence=pipeline.frame(frame());assert.equal(sequence?.length,7200);
  assert.equal(pipeline.diagnostics.inputShape,'[1, 32, 225]');assert.equal(pipeline.diagnostics.inputFinite,true);
  assert.equal(pipeline.prediction({label:'48.Hello',confidence:.84}),null);
  assert.match(pipeline.diagnostics.filterReason,/below 85/);
  assert.equal(pipeline.prediction({label:'48.Hello',confidence:.95}),null);
  assert.match(pipeline.diagnostics.filterReason,/1\/2/);
  assert.equal(pipeline.prediction({label:'48.Hello',confidence:.96})?.label,'48.Hello');
  assert.equal(pipeline.prediction({label:'48.Hello',confidence:.96}),null);
  assert.match(pipeline.diagnostics.filterReason,/Duplicate/);
  pipeline.reset();assert.equal(pipeline.diagnostics.raw,null);assert.equal(pipeline.diagnostics.bufferFrames,0);
  pipeline.frame(frame(),0);pipeline.frame(new Float32Array(225),100);assert.equal(pipeline.diagnostics.bufferFrames,1);
  pipeline.frame(new Float32Array(225),1601);assert.equal(pipeline.diagnostics.bufferFrames,0);
});
