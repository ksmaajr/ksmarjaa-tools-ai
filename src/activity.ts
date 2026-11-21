export type Level='success'|'error'|'warning'|'info';
export type Category='analysis'|'manifest'|'settings'|'api'|'generate'|'app';
export interface ActivityEntry {id:string;time:string;level:Level;category:Category;title:string;message:string;transient?:boolean;}
export interface ActivityInput {level:Level;category:Category;title?:string;message:string;notify?:boolean;persist?:boolean;}
const storageKey='ksmarjaa:activity:v1';
const labels:Record<Level,string>={success:'Berhasil',error:'Proses gagal',warning:'Perlu diperiksa',info:'Informasi'};
const listeners=new Set<(entry:ActivityEntry|null,notify:boolean)=>void>();
export function redact(value:string){return value.replace(/\brms_live_[A-Za-z0-9_-]+/g,'[API key disamarkan]').replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [disamarkan]').replace(/\bsk-[A-Za-z0-9_-]+/g,'[API key disamarkan]').slice(0,4000);}
let entries:ActivityEntry[]=[];
function isRoutineNotice(e:Pick<ActivityEntry,'category'|'level'|'message'>){return e.category==='manifest'&&e.level==='info'&&/^(Belum ada manifest|Menampilkan ringkasan manifest|Tunggu analisis)/i.test(e.message);}
const MAX_ENTRIES=2000;
try{const data=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(data))entries=data.filter(e=>e&&typeof e.id==='string'&&typeof e.time==='string'&&Number.isFinite(Date.parse(e.time))&&typeof e.title==='string'&&typeof e.message==='string'&&['success','error','warning','info'].includes(e.level)&&['analysis','manifest','settings','api','generate','app'].includes(e.category)&&!isRoutineNotice(e)).slice(0,MAX_ENTRIES).map(e=>({id:e.id,time:e.time,level:e.level,category:e.category,title:redact(e.title),message:redact(e.message)}));}catch{/* A damaged log must not prevent starting the app. */}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(entries));}catch{/* Keep the current session usable if local storage is full. */}}
export function getActivity(){return entries.map(e=>({...e}));}
export function publish(input:ActivityInput){const entry:ActivityEntry={id:crypto.randomUUID(),time:new Date().toISOString(),level:input.level,category:input.category,title:redact(input.title||labels[input.level]),message:redact(input.message)};entry.transient=input.persist===false||isRoutineNotice(entry);if(!entry.transient){entries=[entry,...entries].slice(0,MAX_ENTRIES);persist();}for(const listener of listeners)listener(entry,input.notify!==false);return entry;}
export function clearActivity(){entries=[];persist();for(const listener of listeners)listener(null,false);}
export function subscribeActivity(listener:(entry:ActivityEntry|null,notify:boolean)=>void){listeners.add(listener);return()=>listeners.delete(listener);}
export const categoryNames:Record<Category,string>={analysis:'Analisis',manifest:'Manifest',settings:'Pengaturan',api:'Koneksi API',generate:'Generate',app:'Aplikasi'};
export const levelNames:Record<Level,string>={success:'Sukses',error:'Gagal',warning:'Peringatan',info:'Informasi'};
