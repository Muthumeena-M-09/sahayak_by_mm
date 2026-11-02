import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixturePath='ml/data/isl/browser-fixtures.json';
test('real trained model matches reference logits on all held-out clips and runs in Worker',async({page})=>{
  test.skip(!fs.existsSync(fixturePath),'Run dataset preparation/training first; no synthetic model substitute.');
  const fixtures=JSON.parse(fs.readFileSync(fixturePath,'utf-8'));
  const modelErrors:string[]=[];page.on('pageerror',error=>modelErrors.push(error.message));
  const external:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:3101')&&!request.url().startsWith('data:'))external.push(request.url());});
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto('/tests/isl/harness.html');
  await page.waitForFunction(()=>!!(window as any).islAudit);
  let preprocessingMaxError=0;
  for(const sample of fixtures.preprocessing){
    const actual=await page.evaluate(raw=>(window as any).islAudit.preprocess(raw),sample.raw) as number[];
    expect(actual).toHaveLength(7200);
    for(let i=0;i<actual.length;i++)preprocessingMaxError=Math.max(preprocessingMaxError,Math.abs(actual[i]-sample.expected[i]));
  }
  expect(preprocessingMaxError).toBeLessThan(1e-4);
  const run=await page.evaluate(samples=>(window as any).islAudit.batch(samples),fixtures.samples.map((s:any)=>s.x.flat())) as any;
  let maxError=0;
  for(let n=0;n<run.outputs.length;n++){
    const actual=run.outputs[n].logits,reference=fixtures.samples[n].logits;
    expect(actual).toHaveLength(reference.length);
    for(let c=0;c<actual.length;c++){expect(Number.isFinite(actual[c])).toBe(true);maxError=Math.max(maxError,Math.abs(actual[c]-reference[c]));}
    expect(actual.indexOf(Math.max(...actual))).toBe(reference.indexOf(Math.max(...reference)));
  }
  expect(maxError).toBeLessThan(1e-4);
  const prediction=await page.evaluate(x=>(window as any).islAudit.workerPredict(x),fixtures.samples[0].x.flat()) as any;
  expect(prediction.label).toBe('48.Hello');expect(prediction.confidence).toBeGreaterThan(.9);
  const report={samples:run.outputs.length,browser:await page.evaluate(()=>navigator.userAgent),
    modelSha256:await page.evaluate(async()=> (await(await fetch('/models/isl/manifest.json')).json()).modelSha256),
    preprocessingMaxError,maxAbsLogitError:maxError,loadMs:run.loadMs,
    forwardMs:run.outputs.map((row:any)=>row.elapsedMs),workerPrediction:prediction,
    externalRequests:external.filter(url=>!url.includes('fonts.googleapis.com')),pageErrors:modelErrors};
  fs.mkdirSync('docs/isl-results',{recursive:true});
  fs.writeFileSync('docs/isl-results/browser.json',JSON.stringify(report,null,2));
  expect(report.externalRequests).toEqual([]);expect(modelErrors).toEqual([]);
});
test('real landmark sequence fills 32-frame pipeline, runs the actual worker and preserves safeguards',async({page})=>{
  test.skip(!fs.existsSync(fixturePath),'Real local model/landmark fixtures are required.');
  const fixtures=JSON.parse(fs.readFileSync(fixturePath,'utf-8'));
  await page.goto('/tests/isl/harness.html');await page.waitForFunction(()=>!!(window as any).islAudit);
  const result=await page.evaluate(raw=>(window as any).islAudit.pipeline(raw),fixtures.preprocessing[0].raw) as any;
  expect(result.progress).toContain(31);expect(result.progress).toContain(32);
  expect(result.diagnostics.inputFinite).toBe(true);expect(result.diagnostics.inputShape).toBe('[1, 32, 225]');
  expect(result.diagnostics.requests).toBeGreaterThan(0);expect(result.diagnostics.responses).toBe(result.diagnostics.requests);
  expect(Number.isFinite(result.diagnostics.raw.confidence)).toBe(true);
  expect(result.diagnostics.threshold).toBe(.85);expect(result.diagnostics.required).toBe(2);
  expect(result.diagnostics.filterReason.length).toBeGreaterThan(0);
});
