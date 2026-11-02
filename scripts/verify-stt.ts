import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { transcribeAudioBase64 } from '../src/lib/gemini.ts';
import { createPool } from '../src/db/index.ts';
try {
 const bytes=readFileSync(new URL('./stt-live.wav',import.meta.url));
 console.log('Speech sample bytes:',bytes.length);
 const start=Date.now();
 const result=await transcribeAudioBase64({base64Audio:bytes.toString('base64'),mimeType:'audio/wav',languageCode:'en',languageHint:'English'});
 console.log(JSON.stringify({elapsedMs:Date.now()-start,...result}));
 if(!/scholarship/i.test(result.transcript)) process.exitCode=1;
} catch(error) {console.error(error instanceof Error ? error.message : 'STT check failed');process.exitCode=1;}
await createPool().end();

