import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpeechAudio, SpeechError } from './speech.ts';
import { transcribeAudioBase64 } from './gemini.ts';
const audio = Buffer.from('test audio').toString('base64');
test('normalizes browser codec MIME and data URLs',()=>{
 assert.deepEqual(normalizeSpeechAudio(audio,'audio/webm;codecs=opus'),{base64Audio:audio,mimeType:'audio/webm'});
 assert.equal(normalizeSpeechAudio(`data:audio/wav;base64,${audio}`,undefined).mimeType,'audio/wav');
 assert.equal(normalizeSpeechAudio(audio,'audio/x-m4a').mimeType,'audio/mp4');
});
test('rejects malformed, empty, oversized and non-audio payloads',()=>{
 for(const [data,mime,status] of [[null,'audio/wav',400],['','audio/wav',400],['!!!!','audio/wav',400],[audio,'text/plain',415],['a'.repeat(15*1024*1024),'audio/wav',413]] as const)
 assert.throws(()=>normalizeSpeechAudio(data,mime),(e:SpeechError)=>e.status===status);
});
test('Sarvam receives multipart original-language request and normalized audio',async()=>{
 const fetchOriginal=globalThis.fetch; const key=process.env.SARVAM_API_KEY; process.env.SARVAM_API_KEY='test';
 globalThis.fetch=async(_url,init)=>{
  const form=init?.body as FormData;
  assert.equal(form.get('mode'),'transcribe'); assert.equal(form.get('language_code'),'hi-IN');
  assert.ok(init?.signal); assert.equal((form.get('file') as Blob).type,'audio/webm');
  return Response.json({transcript:'नमस्ते',language_code:'hi-IN'});
 };
 try { assert.deepEqual(await transcribeAudioBase64({base64Audio:audio,mimeType:'audio/webm;codecs=opus',languageCode:'hi'}),{transcript:'नमस्ते',detectedLanguageCode:'hi'}); }
 finally { globalThis.fetch=fetchOriginal; if(key===undefined) delete process.env.SARVAM_API_KEY; else process.env.SARVAM_API_KEY=key; }
});
test('silence gives an actionable error rather than success or invented fallback',async()=>{
 const original=globalThis.fetch;const key=process.env.SARVAM_API_KEY;process.env.SARVAM_API_KEY='test';
 globalThis.fetch=async()=>Response.json({transcript:''});
 try {await assert.rejects(transcribeAudioBase64({base64Audio:audio,mimeType:'audio/wav'}),(e:SpeechError)=>e.status===422);}
 finally {globalThis.fetch=original;if(key===undefined)delete process.env.SARVAM_API_KEY;else process.env.SARVAM_API_KEY=key;}
});

test('provider failure falls back to Gemini with normalized audio',async()=>{
 const original=globalThis.fetch; const sarvam=process.env.SARVAM_API_KEY;const gemini=process.env.GEMINI_API_KEY;
 process.env.SARVAM_API_KEY='test';process.env.GEMINI_API_KEY='test';let calls=0;
 globalThis.fetch=async(input,init)=>{
  calls++;
  if(String(input instanceof Request ? input.url : input).includes('sarvam.ai')) return new Response('',{status:503});
  return Response.json({candidates:[{content:{parts:[{text:'Hello Sahayak'}],role:'model'},finishReason:'STOP'}]});
 };
 try {assert.equal((await transcribeAudioBase64({base64Audio:audio,mimeType:'audio/wav'})).transcript,'Hello Sahayak');assert.equal(calls,2);}
 finally {globalThis.fetch=original;for(const [name,value] of [['SARVAM_API_KEY',sarvam],['GEMINI_API_KEY',gemini]]) {if(value===undefined) delete process.env[name!];else process.env[name!]=value;}}
});

test('all scheduled Indian language codes use their native STT language hints',async()=>{
 const original=globalThis.fetch;const key=process.env.SARVAM_API_KEY;process.env.SARVAM_API_KEY='test';
 const codes=['en','hi','ta','te','kn','ml','mr','bn','gu','or','pa','as','ur','ne','kok','ks','sd','sa','sat','mni','brx','mai','doi'];
 try {for(const code of codes){globalThis.fetch=async(_url,init)=>{const expected=(code==='or'?'od':code)+'-IN';assert.equal((init?.body as FormData).get('language_code'),expected);return Response.json({transcript:'recorded words',language_code:expected});};assert.equal((await transcribeAudioBase64({base64Audio:audio,mimeType:'audio/wav',languageCode:code})).detectedLanguageCode,code);}}
 finally{globalThis.fetch=original;if(key===undefined)delete process.env.SARVAM_API_KEY;else process.env.SARVAM_API_KEY=key;}
});
test('exhausted Sarvam credits produce actionable errors when backup is not configured',async()=>{
 const original=globalThis.fetch;const sarvam=process.env.SARVAM_API_KEY;const gemini=process.env.GEMINI_API_KEY;process.env.SARVAM_API_KEY='test';delete process.env.GEMINI_API_KEY;
 globalThis.fetch=async()=>Response.json({error:{code:'insufficient_quota_error',message:'No credits available.'}},{status:402});
 try {await assert.rejects(transcribeAudioBase64({base64Audio:audio,mimeType:'audio/wav',languageCode:'ta'}),(error:SpeechError)=>error.code==='STT_QUOTA_EXHAUSTED'&&/credits/.test(error.message));}
 finally{globalThis.fetch=original;for(const [name,value] of [['SARVAM_API_KEY',sarvam],['GEMINI_API_KEY',gemini]]){if(value===undefined)delete process.env[name!];else process.env[name!]=value;}}
});
