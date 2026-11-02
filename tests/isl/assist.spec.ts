import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test('review, edit, clear and explicit chat draft submission without camera upload',async({page})=>{
  const sent:unknown[]=[];
  await page.route('**/api/chat/stream',route=>{sent.push(route.request().postDataJSON());return route.fulfill({body:'data: {}\n\n'});});
  await page.goto('/tests/isl/harness.html');
  await page.getByLabel('Review word',{exact:true}).fill('School');
  await page.getByRole('button',{name:'Confirm word'}).click();
  await expect(page.getByLabel('Reviewed phrase',{exact:true})).toHaveValue('School');
  expect(sent).toHaveLength(0);
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await expect(page.getByLabel('Reviewed phrase',{exact:true})).toHaveValue('');
  await page.getByLabel('Review word',{exact:true}).fill('Hospital');
  await page.getByRole('button',{name:'Confirm word'}).click();
  await page.getByRole('button',{name:'Use phrase in chat draft'}).click();
  await expect(page.getByLabel('Chat draft')).toHaveValue('Hospital');expect(sent).toHaveLength(0);
  await page.getByLabel('Chat draft').fill('Hospital documents');
  await page.getByRole('button',{name:'Send reviewed chat'}).click();
  await expect.poll(()=>sent.length).toBe(1);
  expect(sent[0]).toEqual({message:'Hospital documents',preferredLanguageCode:'ta',conversationId:12,input_mode:'isl'});
});
test('camera starts only on click and stops tracks when closed',async({page})=>{
  await page.addInitScript(()=>{
    const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).cameraStreams=[];
    navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);(window as any).cameraStreams.push(stream);return stream;};
  });
  await page.goto('/tests/isl/harness.html');
  expect(await page.evaluate(()=>(window as any).cameraStreams.length)).toBe(0);
  await page.getByRole('button',{name:'Start camera',exact:true}).click();
  await expect(page.getByText('● Camera is on',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Return to text / voice'}).click();
  expect(await page.evaluate(()=>(window as any).cameraStreams.every((stream:MediaStream)=>stream.getTracks().every(track=>track.readyState==='ended')))).toBe(true);
});
for(const [code,description] of [['NotAllowedError','Camera permission was denied'],['NotFoundError','No camera was found'],['NotReadableError','The camera is busy']] as const){
  test(`camera handles ${code}`,async({page})=>{
    await page.addInitScript(name=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Test camera failure',name);};},code);
    await page.goto('/tests/isl/harness.html');await page.getByRole('button',{name:'Start camera',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:description})).toBeVisible();
  });
}
test('mobile layout fits viewport and missing manifest is explained',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.route('**/models/isl/manifest.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('/tests/isl/harness.html');await expect(page.getByRole('alert')).toContainText('manifest is missing');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('local MediaPipe assets initialize and process synthetic camera frames',async({page})=>{
  const external:string[]=[];
  const events:string[]=[];
  page.on('console',message=>events.push(message.type()+': '+message.text()));
  page.on('pageerror',error=>events.push('pageerror: '+error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:3101') && !r.url().includes('fonts.googleapis.com'))external.push(r.url());});
  await page.goto('/tests/isl/harness.html?live');
  await page.getByRole('button',{name:'Probe local extraction'}).click();
  await page.waitForTimeout(3000);
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/probe-diagnostic.json',JSON.stringify({events,dom:await page.locator('body').innerHTML(),url:page.url()},null,2));
  // Synthetic test video has no supported ISL signing. Unsure proves a completed
  // landmark callback; it is never counted as a real recognition test.
  await page.waitForFunction(()=>['unsure','error'].includes(document.querySelector('[data-testid="probe-status"]')?.textContent||''),null,{timeout:30000});
  await expect(page.getByTestId('probe-error')).toHaveText('');
  await expect(page.getByTestId('probe-status')).toHaveText('unsure',{timeout:1000});
  await expect(page.getByTestId('probe-error')).toHaveText('');expect(external).toEqual([]);
});
test('existing citizen chat receives only confirmed draft and renders SSE response',async({page})=>{
  const sent:any[]=[];
  await page.route('**/api/**',async route=>{
    if(route.request().url().endsWith('/api/chat/stream')){
      const body=route.request().postDataJSON();sent.push(body);
      const message={id:2,conversationId:12,senderRole:'assistant',content:'Bring your identity document.',citations:[],suggestedActions:[]};
      return route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({type:'done',assistantMessage:message})}\n\n`});
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify({languages:[],services:[],conversations:[]})});
  });
  await page.goto('/tests/isl/harness.html?chat');
  await page.getByRole('button',{name:'Sahayak ISL Assist',exact:true}).click();
  await page.getByLabel('Review word',{exact:true}).fill('School');
  await page.getByRole('button',{name:'Confirm word'}).click();
  await page.getByRole('button',{name:'Use phrase in chat draft'}).click();
  expect(sent).toHaveLength(0);
  await page.locator('form input[type="text"]').fill('School documents');
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText('Bring your identity document.',{exact:true})).toBeVisible();
  expect(sent[0]).toEqual({message:'School documents',preferredLanguageCode:'en',input_mode:'isl'});
  // Existing text path remains usable after the ISL draft.
  await page.getByRole('button',{name:'Text',exact:true}).click();
  await page.locator('form input[type="text"]').fill('Hello');
  await page.locator('form button[type="submit"]').click();
  await expect.poll(()=>sent.length).toBe(2);expect(sent[1].input_mode).toBeUndefined();
});
