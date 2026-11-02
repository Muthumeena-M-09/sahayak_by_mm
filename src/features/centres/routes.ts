import type {Router,Response} from 'express';
import {createHash} from 'node:crypto';
import {createPool} from '../../db/index.ts';
import {requireAuth,type AuthRequest} from '../../middleware/auth.ts';
import {centreStatus,type Centre,type District} from './core.ts';
export function registerCentreRoutes(app:Router) {
 const pool=createPool(); const subscribers=new Map<string,Set<Response>>();
 const bad=(res:Response)=>res.status(400).json({error:'Invalid district or request.'});
 const districtExists=async(code:unknown)=>typeof code==='string'&&/^[a-z]+$/.test(code)&&(await pool.query('SELECT 1 FROM help_location.districts WHERE code=$1',[code])).rowCount===1;
 const failure=(res:Response,error:unknown)=>{console.error('Help centres unavailable:',error instanceof Error?error.message:'database error');res.status(503).json({error:'Help centre information is temporarily unavailable.'});};
 const counts=async(district:string)=>{
  const result=await pool.query(`SELECT r.centre_id,r.status,count(*)::int AS count FROM help_location.reports r JOIN help_location.centres c ON c.id=r.centre_id WHERE c.district_code=$1 AND c.active AND r.reported_at>now()-interval '2 hours' GROUP BY r.centre_id,r.status`,[district]);
  const data:Record<string,Record<string,number>>={};for(const row of result.rows){data[row.centre_id]??={busy:0,quiet:0,closed:0};data[row.centre_id][row.status]=row.count;}return data;
 };
 app.get('/api/districts',async(_req,res)=>{try{const rows=await pool.query('SELECT data FROM help_location.districts ORDER BY data->>\'nameEn\'');res.json({districts:rows.rows.map(r=>r.data as District)});}catch(e){failure(res,e);}});
 app.get('/api/location',requireAuth,async(req:AuthRequest,res)=>{try{const rows=await pool.query('SELECT district_code,source FROM help_location.preferences WHERE user_uid=$1',[req.authContext!.uid]);res.json(rows.rows[0]||null);}catch(e){failure(res,e);}});
 app.post('/api/location',requireAuth,async(req:AuthRequest,res)=>{
  try{const body=req.body||{};if(Object.keys(body).some(k=>!['district_code','source','consent'].includes(k))||!await districtExists(body.district_code)||!['gps','manual','approximate'].includes(body.source)||body.consent!==true)return bad(res);
   await pool.query(`INSERT INTO help_location.preferences(user_uid,district_code,source) VALUES($1,$2,$3) ON CONFLICT(user_uid) DO UPDATE SET district_code=excluded.district_code,source=excluded.source,consent_at=now()`,[req.authContext!.uid,body.district_code,body.source]);res.json({saved:true});
  }catch(e){failure(res,e);}
 });
 app.delete('/api/location',requireAuth,async(req:AuthRequest,res)=>{try{await pool.query('DELETE FROM help_location.preferences WHERE user_uid=$1',[req.authContext!.uid]);res.json({deleted:true});}catch(e){failure(res,e);}});
 app.get('/api/centres',async(req,res)=>{
  try {const district=req.query.district;if((req.query.openNow!==undefined&&!['true','false'].includes(String(req.query.openNow)))||!await districtExists(district)||Object.keys(req.query).some(k=>!['district','type','openNow'].includes(k))||(req.query.type&&!['welfare','esevai','csc','college','other'].includes(String(req.query.type))))return bad(res);
   const [rows,holidays,reports]=await Promise.all([pool.query('SELECT id,data,verified_at FROM help_location.centres WHERE district_code=$1 AND active ORDER BY data->>\'name\'',[district]),pool.query('SELECT day::text FROM help_location.holidays WHERE district_code=$1',[district]),counts(String(district))]);
   const now=new Date();let centres=rows.rows.map(r=>({...r.data,id:r.id,verifiedAt:r.verified_at.toISOString(),...centreStatus(r.data.hours,holidays.rows.map(h=>h.day),now),stale:now.getTime()-r.verified_at.getTime()>90*86400000,reports:reports[r.id]||{busy:0,quiet:0,closed:0}} as Centre));
   if(req.query.type)centres=centres.filter(c=>c.type===req.query.type);if(req.query.openNow==='true')centres=centres.filter(c=>c.openStatus==='open');res.json({centres,serverTime:now.toISOString()});
  }catch(e){failure(res,e);}
 });
 // Public, district-scoped aggregate counts only: no user IDs, coordinates or individual reports.
 app.get('/api/centres/events',async(req,res)=>{
  try {const district=String(req.query.district||'');if(!await districtExists(district))return bad(res);
   if((subscribers.get(district)?.size||0)>=100)return res.status(429).end();
   res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();subscribers.set(district,subscribers.get(district)||new Set());subscribers.get(district)!.add(res);
   res.write(`data: ${JSON.stringify({type:'centre_status',counts:await counts(district)})}\n\n`);
   const timer=setInterval(async()=>{try{res.write(`data: ${JSON.stringify({type:'centre_status',counts:await counts(district)})}\n\n`);}catch{res.write(': keepalive\n\n');}},30000);
   req.on('close',()=>{clearInterval(timer);subscribers.get(district)?.delete(res);if(!subscribers.get(district)?.size)subscribers.delete(district);});
  }catch(e){if(!res.headersSent)failure(res,e);else res.end();}
 });
 app.post('/api/centres/:id/report',requireAuth,async(req:AuthRequest,res)=>{
  try{if(!['busy','quiet','closed'].includes(req.body?.status)||Object.keys(req.body||{}).some(k=>k!=='status'))return bad(res);
   const centre=await pool.query('SELECT district_code FROM help_location.centres WHERE id=$1 AND active',[req.params.id]);if(!centre.rowCount)return res.status(404).json({error:'Centre not found.'});
   const hash=createHash('sha256').update(req.headers.authorization||'').digest('hex');
   const saved=await pool.query(`INSERT INTO help_location.reports(centre_id,session_hash,user_uid,status) VALUES($1,$2,$3,$4) ON CONFLICT(centre_id,session_hash) DO UPDATE SET status=excluded.status,reported_at=now() WHERE help_location.reports.reported_at<=now()-interval '30 minutes' RETURNING centre_id`,[req.params.id,hash,req.authContext!.uid,req.body.status]);
   if(!saved.rowCount){res.setHeader('Retry-After','1800');return res.status(429).json({error:'Please wait 30 minutes before reporting this centre again.'});}
   const district=centre.rows[0].district_code;const aggregate=await counts(district);for(const client of subscribers.get(district)||[])client.write(`data: ${JSON.stringify({type:'centre_status',counts:aggregate})}\n\n`);
   await pool.query("DELETE FROM help_location.reports WHERE reported_at<=now()-interval '2 hours'");res.json({saved:true,counts:aggregate});
  }catch(e){failure(res,e);}
 });
}
