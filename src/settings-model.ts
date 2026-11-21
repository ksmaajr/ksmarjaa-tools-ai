export interface Settings {
  schemaVersion: number; baseUrl: string; apiTestPath: string;
  batchSize: number; batchDelaySeconds: number; requestTimeoutSeconds: number; pollingIntervalSeconds: number;
  requestMaxAttempts: number; downloadMaxAttempts: number; retryInitialSeconds: number; retryMaxSeconds: number; retryBackoff: boolean;
  autoDownload: boolean; useCustomTitle: boolean; motion: 'system'|'full'|'reduced'; glassOpacity: number; theme:'dark'|'light'; language:'id'|'en';
}
export const defaults: Settings = {schemaVersion:1,baseUrl:RMS_API.baseUrl,apiTestPath:RMS_API.storesPath,batchSize:10,batchDelaySeconds:20,requestTimeoutSeconds:120,pollingIntervalSeconds:5,requestMaxAttempts:5,downloadMaxAttempts:5,retryInitialSeconds:5,retryMaxSeconds:60,retryBackoff:true,autoDownload:true,useCustomTitle:true,motion:'system',glassOpacity:55,theme:'dark',language:'id'};
export function migrateSettings(value:Partial<Settings>):Settings{return {...defaults,...value,batchSize:Math.max(1,Math.min(30,Math.trunc(value.batchSize??defaults.batchSize))),baseUrl:RMS_API.baseUrl,apiTestPath:RMS_API.storesPath};}
export const ranges = {batchSize:[1,30],batchDelaySeconds:[0,86400],requestTimeoutSeconds:[5,3600],pollingIntervalSeconds:[1,300],requestMaxAttempts:[1,20],downloadMaxAttempts:[1,20],retryInitialSeconds:[1,3600],retryMaxSeconds:[1,86400],glassOpacity:[35,95]} as const;
export type Errors = Partial<Record<keyof Settings|'apiKey', string>>;
export function normalizeBase(raw:string) {return raw.trim().replace(/\/+$/,'');}
export function keyTarget(raw:string) {try{return new URL(normalizeBase(raw)).href.replace(/\/+$/,'');}catch{return '';}}
export function validateSettings(value:Settings):Errors {
  const errors:Errors={};
  if(value.schemaVersion!==1) errors.schemaVersion='Versi pengaturan tidak didukung.';
  if(value.baseUrl){try {
    const u=new URL(value.baseUrl);
    if(!/^https?:\/\//i.test(value.baseUrl)||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))||u.username||u.password||u.search||u.hash) throw new Error();
  }catch{errors.baseUrl='Gunakan URL HTTPS tanpa username, password, query, atau fragmen. HTTP hanya untuk localhost.';}}
  if(!value.apiTestPath.startsWith('/')||value.apiTestPath.startsWith('//')||/[?#\\]/.test(value.apiTestPath)) errors.apiTestPath='Gunakan path seperti /api/tools/auth-check, tanpa query atau fragmen.';
  for(const [key,[min,max]] of Object.entries(ranges)) {const n=value[key as keyof Settings];if(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max) errors[key as keyof Settings]=`Isi bilangan bulat antara ${min}–${max}.`;}
  if(value.retryMaxSeconds<value.retryInitialSeconds) errors.retryMaxSeconds='Harus sama atau lebih besar dari jeda awal.';
  for(const key of ['retryBackoff','autoDownload','useCustomTitle'] as const) if(typeof value[key]!=='boolean')errors[key]='Pilihan tidak valid.';
  if(!['system','full','reduced'].includes(value.motion))errors.motion='Pilihan animasi tidak valid.';
  if(!['dark','light'].includes(value.theme))errors.theme='Tema tidak valid.';
  if(!['id','en'].includes(value.language))errors.language='Bahasa tidak valid.';
  return errors;
}
export function validateKey(key:string) {return !key||/\s|[\u0000-\u001f\u007f]/.test(key)||new TextEncoder().encode(key).length>2048?'Isi API key tanpa spasi, maksimal 2048 karakter.':'';}
export interface Snapshot {settings:Settings;hasApiKey:boolean;}
export interface ApiTest {code:string;message:string;httpStatus:number|null;latencyMs:number;stores?:RmsStore[];}
export interface SavePayload {settings:Settings;keyAction:'keep'|'set'|'remove';apiKey?:string;}
import {RMS_API,type RmsStore} from './api-contract';
