const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.QA_TEST_ORIGIN||'http://127.0.0.1:3188';
 const request=async(path,init={})=>{const response=await fetch(base+path,{...init,signal:AbortSignal.timeout(120000)});assert.ok(response.ok,`${path}: HTTP ${response.status}`);return response;};
 const guest=await (await request('/api/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferredLanguage:'ta'})})).json();
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+guest.sessionToken};
 try {
  for(const language of ['ta','hi']) {
   const started=Date.now();
   const response=await request('/api/chat/stream',{method:'POST',headers,body:JSON.stringify({message:'How can a student apply for a scholarship through the National Scholarship Portal?',preferredLanguageCode:language})});
   const raw=await response.text();const events=raw.split(/\r?\n\r?\n/).flatMap(f=>{const line=f.split('\n').find(l=>l.startsWith('data: '));return line?[JSON.parse(line.slice(6))]:[];});
   const failure=events.find(e=>e.type==='error');if(failure)throw new Error(failure.error);
   const done=events.find(e=>e.type==='done');assert.ok(done,'Missing saved completion');
   const message=done.assistantMessage;assert.equal(message.detectedLanguage,language);
   assert.match(message.content,language==='ta'?/[\u0B80-\u0BFF]/:/[\u0900-\u097F]/);
   const history=await(await request(`/api/conversations/${done.conversation.id}/messages`,{headers})).json();
   const saved=history.messages.find(m=>m.id===message.id);assert.ok(saved);assert.equal(saved.content,message.content);assert.deepEqual(saved.citations,message.citations);
   assert.ok(message.citations.length,'Expected grounded scholarship citations');
   for(const citation of message.citations)assert.ok(message.content.includes(`[SOURCE ${citation.sourceNumber}]`));
   console.log(JSON.stringify({language,elapsedMs:Date.now()-started,citations:message.citations.length,savedHistory:true,answer:message.content.slice(0,240)}));
  }
 } finally {const response=await fetch(base+'/api/me/data',{method:'DELETE',headers});console.log('Temporary guest cleanup HTTP',response.status);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
