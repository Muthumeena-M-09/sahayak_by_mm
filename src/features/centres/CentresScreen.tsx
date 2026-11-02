import {useEffect,useMemo,useRef,useState} from 'react';
import {MapPin,Search,Navigation,Phone,ExternalLink} from 'lucide-react';
import {useApp} from '../../context/AppContext.tsx';
import {centreText} from './i18n.ts';
import {detectDistrict,directions,distanceKm,type BoundaryFeature,type Centre,type District} from './core.ts';
export function CentresScreen(){
 const {currentLanguage,apiFetch}=useApp();const tr=(n:number)=>centreText(currentLanguage.code,n);
 const [districts,setDistricts]=useState<District[]>([]),[district,setDistrict]=useState(''),[search,setSearch]=useState(''),[centres,setCentres]=useState<Centre[]>([]),[consent,setConsent]=useState(false),[type,setType]=useState(''),[openNow,setOpenNow]=useState(false),[loading,setLoading]=useState(false),[locating,setLocating]=useState(false),[notice,setNotice]=useState<number|null>(null),[coordinates,setCoordinates]=useState<{latitude:number;longitude:number}|null>(null),[revision,setRevision]=useState(0),[reporting,setReporting]=useState<string|null>(null);
 const [permission,setPermission]=useState(46);
 const consentWrites=useRef(Promise.resolve());
 const consentRef=useRef(false);consentRef.current=consent;
 const picker=useRef<HTMLSelectElement>(null);const mounted=useRef(true);const requestVersion=useRef(0);
 useEffect(()=>{
  mounted.current=true;let active=true;const prefVersion=requestVersion.current;
  apiFetch<{districts:District[]}>('/api/districts').then(data=>{
   if(!data||!Array.isArray(data.districts))throw new Error('Invalid districts response. Restart the backend server.');
   if(active)setDistricts(data.districts);
  }).catch(()=>{if(active)setNotice(35);});
  apiFetch<{district_code:string}|null>('/api/location').then(pref=>{
   if(active&&pref?.district_code&&requestVersion.current===prefVersion){setDistrict(pref.district_code);setConsent(true);}
  }).catch(()=>{if(active)setNotice(35);});
  return()=>{active=false;mounted.current=false;};
 },[apiFetch,revision]);

 useEffect(()=>{if(!district)return;let active=true;setLoading(true);setCentres([]);const query=new URLSearchParams({district,...(type?{type}:{}),...(openNow?{openNow:'true'}:{})});
 const refresh=()=>apiFetch<{centres:Centre[]}>(`/api/centres?${query}`).then(data=>{if(!data||!Array.isArray(data.centres))throw new Error('Invalid centres response. Restart the backend server.');if(active)setCentres(data.centres);}).catch(()=>{if(active)setNotice(35);}).finally(()=>{if(active)setLoading(false);});void refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[district,type,openNow,apiFetch,revision]);
 useEffect(()=>{if(!district)return;const events=new EventSource(`/api/centres/events?district=${encodeURIComponent(district)}`);events.onmessage=e=>{try{const data=JSON.parse(e.data);if(data.type==='centre_status')setCentres(previous=>previous.map(c=>({...c,reports:data.counts[c.id]||{busy:0,quiet:0,closed:0}})));}catch{/* reconnect will refresh counts */}};return()=>events.close();},[district]);
 const persist=(code:string,source:string)=>{
  consentWrites.current=consentWrites.current.catch(()=>{}).then(async()=>{
   if(!consentRef.current)return;
   try {await apiFetch('/api/location',{method:'POST',body:JSON.stringify({district_code:code,source,consent:true})});}
   catch {if(mounted.current)setNotice(35);}
  });return consentWrites.current;
 };
 const changeConsent=(checked:boolean)=>{
  requestVersion.current++;setLocating(false);
  consentRef.current=checked;setConsent(checked);
  if(checked){if(district)void persist(district,'manual');return;}
  consentWrites.current=consentWrites.current.catch(()=>{}).then(async()=>{
   try {await apiFetch('/api/location',{method:'DELETE'});}
   catch {if(mounted.current){setNotice(35);setConsent(true);consentRef.current=true;}}
  });
 };

 const choose=(code:string)=>{requestVersion.current++;setLocating(false);setDistrict(code);setNotice(null);void persist(code,'manual');};
 const locate=async()=>{const version=++requestVersion.current;setLocating(true);setNotice(null);try{
  if(!navigator.geolocation)throw new Error('unavailable');
  const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:10000,maximumAge:60000,enableHighAccuracy:false}));
  if(!mounted.current||version!==requestVersion.current)return;
  const point={latitude:position.coords.latitude,longitude:position.coords.longitude};setCoordinates(point);setPermission(47);
  const response=await fetch('/location/boundaries.json');if(!response.ok)throw new Error('boundaries');const boundaries=await response.json() as {available:boolean;sourceUrl?:string;features:BoundaryFeature[]};
  if(!mounted.current||version!==requestVersion.current)return;
  if(!boundaries.available||!boundaries.sourceUrl||!boundaries.features.length){setNotice(9);picker.current?.focus();return;}
  const code=detectDistrict(point.latitude,point.longitude,boundaries.features);if(!code||!districts.some(d=>d.code===code)){setNotice(10);picker.current?.focus();return;}
  setDistrict(code);await persist(code,'gps');
 }catch(error){if(mounted.current&&version===requestVersion.current){setPermission((error as GeolocationPositionError)?.code===1?48:49);setNotice(7);picker.current?.focus();}}finally{if(mounted.current&&version===requestVersion.current)setLocating(false);}};
 const sorted=useMemo(()=>centres.map(c=>({...c,distance:coordinates&&c.latitude!==null&&c.longitude!==null?distanceKm(coordinates,{latitude:c.latitude,longitude:c.longitude}):null})).sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)||a.name.localeCompare(b.name)),[centres,coordinates]);
 const report=async(id:string,status:string)=>{setReporting(id);try{const response=await apiFetch<{counts:Record<string,Centre['reports']>}>(`/api/centres/${encodeURIComponent(id)}/report`,{method:'POST',body:JSON.stringify({status})});setCentres(prev=>prev.map(c=>({...c,reports:response.counts[c.id]||{busy:0,quiet:0,closed:0}})));setNotice(33);}catch(e){setNotice(/30|429/.test(e instanceof Error?e.message:'')?34:35);}finally{setReporting(null);}};
 return <section className="centres-page space-y-6"><header className="p-6 rounded-lg"><h1 className="font-display text-3xl">{tr(0)}</h1><p className="mt-3">{tr(5)}</p></header>
 <div className="bg-card p-6 space-y-4"><div className="flex flex-wrap gap-3"><button className="bg-primary text-on-primary rounded-lg px-4 flex items-center gap-2" onClick={locate} disabled={locating}><MapPin size={18}/>{locating?tr(6):tr(1)}</button><button className="border rounded-lg px-4" onClick={()=>picker.current?.focus()}>{tr(2)}</button></div>
 <p role="status" className="text-sm">{tr(permission)}</p>
 <label className="block"><span className="block mb-2">{tr(3)}</span><div className="relative"><Search className="absolute start-3 top-4" size={18}/><input className="w-full ps-10 p-3" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr(3)}/></div></label>
 <label className="block"><span className="block mb-2">{tr(2)}</span><select ref={picker} className="w-full p-3" value={district} onChange={e=>choose(e.target.value)}><option value="">{tr(44)}</option>{districts.filter(d=>!search||`${d.nameEn} ${d.nameTa}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())||d.code===district).map(d=><option key={d.code} value={d.code}>{currentLanguage.code==='ta'?d.nameTa:d.nameEn}</option>)}</select></label>
 <label className="flex items-center gap-3"><input type="checkbox" checked={consent} onChange={e=>changeConsent(e.target.checked)}/>{tr(4)}</label></div>
 {notice!==null&&<p role="status" className="border-2 border-dashed rounded-lg p-4">{tr(notice)} {notice===35&&<button className="underline" onClick={()=>setRevision(r=>r+1)}>{tr(43)}</button>}</p>}
 {district&&<><div className="flex flex-wrap gap-4"><select className="p-3" aria-label={tr(11)} value={type} onChange={e=>setType(e.target.value)}>{[['',11],['welfare',13],['esevai',14],['csc',15],['college',16],['other',17]].map(([value,label])=><option key={value} value={value}>{tr(Number(label))}</option>)}</select><label className="flex gap-2 items-center"><input type="checkbox" checked={openNow} onChange={e=>setOpenNow(e.target.checked)}/>{tr(12)}</label></div><p className="text-sm">{tr(36)} {tr(41)}</p>
 {loading?<p role="status">{tr(18)}</p>:!sorted.length?<p className="bg-card p-6">{tr(19)}</p>:<div className="grid gap-4 md:grid-cols-2">{sorted.map(c=>{const links=directions(c);return <article key={c.id} className="bg-card p-6 rounded-lg space-y-3"><h2 className="font-display text-xl">{c.name}</h2><p>{tr(({welfare:13,esevai:14,csc:15,college:16,other:17})[c.type])}</p><address className="not-italic">{c.address}</address>{c.distance!==null&&<p>{tr(37)}: {new Intl.NumberFormat(currentLanguage.localeCode,{maximumFractionDigits:1}).format(c.distance)} km</p>}<p className="font-semibold">{tr(c.openStatus==='open'?21:c.openStatus==='closed'?22:20)} {c.closesAt&&`${tr(23)} ${c.closesAt}`}</p><p className="text-sm">{tr(45)}</p>{c.phone&&<a className="inline-flex items-center gap-2" href={`tel:${c.phone.split(',')[0].replace(/[^+\d]/g,'')}`}><Phone size={16}/>{c.phone}</a>}
 <ul>{c.services.map(s=><li key={s}>{s==='scholarship_guidance'?tr(39):s}</li>)}</ul><p>{c.requiredDocuments.length?c.requiredDocuments.join(', '):tr(38)}</p><p className="text-sm">{tr(24)}: {new Intl.DateTimeFormat(currentLanguage.localeCode).format(new Date(c.verifiedAt))}</p>{c.stale&&<p className="border-2 border-dashed p-3">{tr(25)}</p>}<a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex gap-2">{tr(28)}<ExternalLink size={16}/></a>
 <div className="flex flex-wrap gap-3"><a className="border-2 rounded-lg p-3 flex gap-2 items-center" href={links.google} target="_blank" rel="noopener noreferrer"><Navigation size={16}/>{tr(26)}</a><a className="border-2 rounded-lg p-3" href={links.osm} target="_blank" rel="noopener noreferrer">{tr(27)}</a></div>
 <fieldset className="border-t-2 pt-3"><legend className="text-sm">{tr(29)}</legend><div className="flex flex-wrap gap-2">{(['busy','quiet','closed'] as const).map((status,i)=><button key={status} disabled={reporting===c.id} className="border-2 rounded-lg px-3" onClick={()=>report(c.id,status)}>{tr(30+i)} ({c.reports[status]})</button>)}</div></fieldset></article>;})}</div>}
 <div className="bg-card p-6"><h2 className="font-display text-xl">{tr(40)}</h2><a target="_blank" rel="noopener noreferrer" href="https://www.bcmbcmw.tn.gov.in/welfschemes.htm">{tr(39)} — Tamil Nadu</a></div></>}
 </section>;
}
