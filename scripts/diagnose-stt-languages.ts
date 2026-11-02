import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {getSarvamApiKey} from '../src/lib/sarvam.ts';
import {createPool} from '../src/db/index.ts';
const key=await getSarvamApiKey();console.log('Sarvam configured:',Boolean(key));
try {if(key){const bytes=await readFile(new URL('./stt-live.wav',import.meta.url));for(const language of ['ta-IN','te-IN','kn-IN']){const form=new FormData();form.append('file',new Blob([bytes],{type:'audio/wav'}),'test.wav');form.append('model','saaras:v3');form.append('mode','transcribe');form.append('language_code',language);const start=Date.now();try{const res=await fetch('https://api.sarvam.ai/speech-to-text',{method:'POST',headers:{'api-subscription-key':key},body:form,signal:AbortSignal.timeout(30000)});const data=await res.json();console.log(JSON.stringify({language,status:res.status,ms:Date.now()-start,...(!res.ok?{error:data}:{transcript:data.transcript,detected:data.language_code})}));}catch(e){console.log(language,e instanceof Error?e.message:'error');}}}}finally{await createPool().end();}
