const fs = require('node:fs');
(async()=>{
 const origin='http://127.0.0.1:3187';
 const guest=await fetch(origin+'/api/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferredLanguage:'en'}),signal:AbortSignal.timeout(30000)});
 const session=await guest.json();
 console.log('Guest session HTTP',guest.status);
 if(!guest.ok) {console.log(session.error);process.exitCode=1;return;}
 const start=Date.now();
 const res=await fetch(origin+'/api/voice/stt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.sessionToken},body:JSON.stringify({base64Audio:fs.readFileSync('scripts/stt-live.wav').toString('base64'),mimeType:'audio/wav',languageCode:'en'}),signal:AbortSignal.timeout(65000)});
 const result=await res.json();console.log(JSON.stringify({status:res.status,elapsedMs:Date.now()-start,...result}));
 if(!res.ok || !/scholarship/i.test(result.transcript || ''))process.exitCode=1;
 const invalid=await fetch(origin+'/api/voice/stt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.sessionToken},body:JSON.stringify({base64Audio:'!!!!',mimeType:'audio/wav'}),signal:AbortSignal.timeout(15000)});
 console.log('Malformed audio HTTP',invalid.status);if(invalid.status!==400)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
