import { desktop } from './source';
import { defaults, migrateSettings,validateSettings, validateKey, keyTarget, type Settings, type Snapshot, type SavePayload, type ApiTest } from './settings-model';
import {RMS_API,parseStores} from './api-contract';
const previewKeys = new Map<string,string>();
const storageKey='ksmarjaa:settings:v1';
export async function loadSettings():Promise<Snapshot>{
  if(desktop){const {invoke}=await import('@tauri-apps/api/core');return invoke('settings_load');}
  const raw=localStorage.getItem(storageKey);const settings=migrateSettings(raw?JSON.parse(raw):defaults);
  if(Object.keys(validateSettings(settings)).length)throw new Error('Pengaturan preview tidak valid. Data lama tidak ditimpa.');
  return {settings,hasApiKey:previewKeys.has(keyTarget(settings.baseUrl))};
}
export async function saveSettings(payload:SavePayload):Promise<Snapshot>{
  payload={...payload,settings:migrateSettings(payload.settings)};
  if(Object.keys(validateSettings(payload.settings)).length)throw new Error('Perbaiki kolom yang belum valid.');
  if(payload.keyAction==='set'&&validateKey(payload.apiKey||''))throw new Error(validateKey(payload.apiKey||''));
  if(payload.keyAction!=='keep'&&!payload.settings.baseUrl)throw new Error('Isi URL website terlebih dahulu.');
  if(desktop){const {invoke}=await import('@tauri-apps/api/core');return invoke('settings_save',payload as unknown as Record<string,unknown>);}
  // Preview credentials intentionally live in memory only. Never put tokens in web storage.
  localStorage.setItem(storageKey,JSON.stringify(payload.settings));
  const target=keyTarget(payload.settings.baseUrl);
  if(payload.keyAction==='set')previewKeys.set(target,payload.apiKey!);
  if(payload.keyAction==='remove')previewKeys.delete(target);
  return {settings:payload.settings,hasApiKey:previewKeys.has(target)};
}
export async function testApi(settings:Settings,apiKey?:string):Promise<ApiTest>{
  if(desktop){const {invoke}=await import('@tauri-apps/api/core');return invoke('settings_test_api',{apiKey:apiKey??null,timeoutSeconds:settings.requestTimeoutSeconds});}
  const key=apiKey??previewKeys.get(keyTarget(RMS_API.baseUrl));if(!key)throw new Error('Isi API key atau gunakan aplikasi Windows untuk key yang tersimpan.');
  const start=performance.now(); const out=(code:string,message:string,httpStatus:number|null):ApiTest=>({code,message,httpStatus,latencyMs:Math.round(performance.now()-start)});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),settings.requestTimeoutSeconds*1000);
  try{
    const url=new URL(RMS_API.storesPath,RMS_API.baseUrl);
    const response=await fetch(url,{method:'GET',headers:{Accept:'application/json',Authorization:`Bearer ${key}`},redirect:'manual',credentials:'omit',signal:controller.signal});
    const status=response.status;
    if(response.type==='opaqueredirect'||(status>=300&&status<400))return out('redirect','Website mengalihkan request. API key belum terverifikasi.',status||null);
    const errors:Record<number,[string,string]>={401:['unauthorized','API key salah, kedaluwarsa, atau sudah dicabut.'],403:['forbidden','API key tidak memiliki izin images:generate untuk membaca katalog toko.'],404:['not_found','Katalog toko API tidak ditemukan. Periksa deployment fitur API website.'],405:['method_not_allowed','Katalog toko API belum mendukung GET.'],429:['rate_limited','Batas request tercapai. Coba lagi nanti.']};
    if(errors[status])return out(...errors[status],status);
    if(status>=500)return out('server_error','Website mengalami gangguan server.',status);
    if(status!==200)return out('unexpected','Respons endpoint tidak sesuai.',status);
    if(!response.headers.get('content-type')?.includes('json'))return out('invalid_response','Respons bukan JSON autentikasi. API key belum terverifikasi.',status);
    const reader=response.body?.getReader();let bytes=0;const chunks:Uint8Array[]=[];
    if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536){await reader.cancel();return out('invalid_response','Respons endpoint terlalu besar.',status);}chunks.push(value);}}
    const merged=new Uint8Array(bytes);let offset=0;for(const c of chunks){merged.set(c,offset);offset+=c.length;}
    let json;try{json=JSON.parse(new TextDecoder().decode(merged));}catch{return out('invalid_response','Respons JSON tidak valid.',status);}
    const stores=parseStores(json);
    if(!stores)return out('invalid_response','Respons bukan katalog toko Rizky Moto AI yang sesuai. API key belum terverifikasi.',status);
    return {...out('valid',stores.length?`API key valid. ${stores.length} toko aktif dapat diakses.`:'API key valid. Belum ada toko aktif yang dapat diakses.',status),stores};
  }catch(e){return out(controller.signal.aborted?'timeout':'network_error',controller.signal.aborted?'Website tidak merespons sebelum batas waktu.':'Koneksi gagal. Periksa URL dan internet. Preview browser juga memerlukan izin CORS dari website.',null);}
  finally{clearTimeout(timer);}
}
export function applyAppearance(settings:Settings){document.documentElement.dataset.motion=settings.motion;document.documentElement.dataset.theme=settings.theme;document.documentElement.lang=settings.language;document.documentElement.style.setProperty('--glass-opacity',String(settings.glassOpacity/100));if(desktop)void import('@tauri-apps/api/webview').then(({getCurrentWebview})=>getCurrentWebview().setZoom(.9)).catch(()=>{});document.dispatchEvent(new CustomEvent('ksmarjaa:language',{detail:settings.language}));}

export let credentialBlocked=true;
export function setCredentialAvailability(available:boolean){const blocked=!available;if(credentialBlocked===blocked)return;credentialBlocked=blocked;document.dispatchEvent(new CustomEvent('ksmarjaa:credential',{detail:{blocked}}));}
