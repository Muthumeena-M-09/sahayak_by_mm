const WebSocket=require('ws');
(async()=>{
 const targets=await(await fetch('http://127.0.0.1:9223/json')).json();
 const target=targets.find(t=>t.type==='page'); const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const pending=new Map();
 ws.on('message',raw=>{const message=JSON.parse(raw);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')console.log('CONSOLE ERROR',JSON.stringify(message.params.args));if(message.method==='Log.entryAdded')console.log('LOG',JSON.stringify(message.params.entry));if(message.method==='Runtime.exceptionThrown')console.log('BROWSER ERROR',JSON.stringify(message.params.exceptionDetails));});
 const send=(method,params={})=>new Promise(resolve=>{const request=++id;pending.set(request,resolve);ws.send(JSON.stringify({id:request,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});return r.result?.result?.value;};
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Page.navigate',{url:'http://localhost:3000'});
 await new Promise(r=>setTimeout(r,4000));console.log('PAGE',await evaluate('document.body.innerText.slice(0,2200)'));
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('English'))?.click()`);
 await new Promise(r=>setTimeout(r,2000));console.log('AFTER LANGUAGE',await evaluate('document.body.innerText.slice(0,1800)'));
 await evaluate(`window.originalFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.originalFetch(...args);if(String(args[0]).includes('/api/auth/guest'))window.testGuest=await response.clone().json();return response;};Array.from(document.querySelectorAll('button')).find(b=>/Continue as guest/i.test(b.textContent))?.click()`);
 await new Promise(r=>setTimeout(r,3500));for(let attempt=0;attempt<60;attempt++){if(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>/Nearby help centres/i.test(b.textContent))`))break;await new Promise(r=>setTimeout(r,1000));}
 console.log('AFTER GUEST',await evaluate('document.body.innerText.slice(0,1200)'));
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>/Nearby help centres/i.test(b.textContent))?.click()`);
 await new Promise(r=>setTimeout(r,3000));console.log('CENTRES',await evaluate('document.body.innerText.slice(0,1600)'));
 for(let attempt=0;attempt<25;attempt++){if(await evaluate(`document.querySelector('.centres-page select')?.options.length===39`))break;await new Promise(r=>setTimeout(r,1000));}
 const ready=await evaluate(`document.querySelector('.centres-page select')?.options.length`);require('node:assert/strict').equal(ready,39,'Expected 38 districts plus placeholder');
 await evaluate(`var picker=document.querySelector('.centres-page select');picker.value='chennai';picker.dispatchEvent(new Event('change',{bubbles:true}));`);
 for(let attempt=0;attempt<25;attempt++){if(await evaluate(`document.body.innerText.includes('District Backward Classes and Minorities Welfare Office')`))break;await new Promise(r=>setTimeout(r,1000));}
 const cardText=await evaluate('document.body.innerText');require('node:assert/strict').match(cardText,/District Backward Classes and Minorities Welfare Office/);console.log('PASS: navigation, 38-district picker and Chennai office card render in Edge.');
 await evaluate(`window.testGuest?.sessionToken && fetch('/api/me/data',{method:'DELETE',headers:{Authorization:'Bearer '+window.testGuest.sessionToken}}).then(r=>r.status)`);
 ws.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
