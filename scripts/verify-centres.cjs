const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.CENTRES_TEST_ORIGIN||'http://127.0.0.1:3191';
 const request=(path,init={})=>fetch(base+path,{...init,signal:AbortSignal.timeout(20000)});
 const districts=await(await request('/api/districts')).json();assert.equal(districts.districts.length,38);
 const centres=await(await request('/api/centres?district=chennai')).json();assert.ok(centres.centres.length);const centre=centres.centres[0];assert.equal(centre.openStatus,'unknown');assert.ok(centre.sourceUrl.startsWith('https://www.tabcedco.tn.gov.in/'));assert.equal(centre.latitude,null);
 const open=await(await request('/api/centres?district=chennai&openNow=true')).json();assert.equal(open.centres.length,0);
 assert.equal((await request('/api/centres?district=invalid')).status,400);
 const guestResponse=await request('/api/auth/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(guestResponse.status,200);const guest=await guestResponse.json();const headers={'Content-Type':'application/json',Authorization:'Bearer '+guest.sessionToken};
 try {
  const post=(path,body)=>request(path,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('/api/location',{district_code:'chennai',source:'manual',consent:false})).status,400);
  assert.equal(await(await request('/api/location',{headers})).json(),null);
  assert.equal((await post('/api/location',{district_code:'chennai',source:'gps',consent:true,latitude:13,longitude:80})).status,400);
  assert.equal((await post('/api/location',{district_code:'chennai',source:'manual',consent:true})).status,200);
  assert.equal((await(await request('/api/location',{headers})).json()).district_code,'chennai');
  assert.equal((await request('/api/location',{method:'DELETE',headers})).status,200);assert.equal(await(await request('/api/location',{headers})).json(),null);
  const events=await request('/api/centres/events?district=chennai');assert.equal(events.status,200);const reader=events.body.getReader();const initial=await reader.read();assert.match(new TextDecoder().decode(initial.value),/centre_status/);
  const reports=await Promise.all([post(`/api/centres/${centre.id}/report`,{status:'busy'}),post(`/api/centres/${centre.id}/report`,{status:'quiet'})]);assert.deepEqual(reports.map(r=>r.status).sort(),[200,429]);
  const update=await reader.read();assert.match(new TextDecoder().decode(update.value),/centre_status/);await reader.cancel();
  assert.equal((await post(`/api/centres/${centre.id}/report`,{status:'invalid'})).status,400);
  console.log('PASS: 38 districts; sourced offices; unknown hours; filters; invalid districts; consent; coordinate rejection; persisted preference; withdrawal; atomic report cooldown; SSE updates.');
 } finally {const cleanup=await request('/api/me/data',{method:'DELETE',headers});console.log('Temporary guest cleanup HTTP',cleanup.status);assert.equal(cleanup.status,200);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
