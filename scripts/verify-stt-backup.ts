import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {transcribeAudioBase64} from '../src/lib/gemini.ts';
import {createPool} from '../src/db/index.ts';
try {const bytes=await readFile(new URL('./stt-live.wav',import.meta.url));for(const languageCode of ['ta','te','kn']){const started=Date.now();try{const result=await transcribeAudioBase64({base64Audio:bytes.toString('base64'),mimeType:'audio/wav',languageCode});console.log(JSON.stringify({languageHint:languageCode,ms:Date.now()-started,...result}));}catch(error){console.log(JSON.stringify({languageHint:languageCode,error:error instanceof Error?error.message:'failed'}));process.exitCode=1;}}}finally{await createPool().end();}
