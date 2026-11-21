import contract from './api-contract.json';
/** Shared with Rust via include_str!: one trusted website for settings and future generation requests. */
export const RMS_API = Object.freeze(contract);
export interface RmsStore { id:number;name:string;templates_count?:number;marketplace?:string|null;brand_name?:string|null; }
export function parseStores(json:unknown):RmsStore[]|null{
  if(!json||typeof json!=='object'||!('data'in json)||!Array.isArray(json.data))return null;
  if(!json.data.every(store=>store&&typeof store==='object'&&Number.isSafeInteger(store.id)&&store.id>0&&typeof store.name==='string'&&!!store.name.trim()))return null;
  return json.data;
}
