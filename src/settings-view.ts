import './settings.css';
import {settingsTemplate} from './settings-layout';
import type {ActivityInput,Level} from './activity';
import {RMS_API} from './api-contract';
import { desktop } from './source';
import { defaults, ranges, normalizeBase, keyTarget, validateSettings, validateKey, type Settings, type Snapshot, type Errors } from './settings-model';
import { loadSettings, saveSettings, testApi, applyAppearance, setCredentialAvailability } from './settings-client';

export function mountSettings(host:HTMLElement, options:{icons:()=>void;toast:(message:string,error?:boolean,level?:Level)=>void;dirty:(value:boolean)=>void;event?:(input:ActivityInput)=>void}){
  const symbol=(name:string)=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const numeric=(key:keyof typeof ranges,label:string,unit:string,hint:string)=>`<div class="setting-field"><label for="setting-${key}">${label}</label><div class="input-unit"><input id="setting-${key}" name="${key}" type="number" min="${ranges[key][0]}" max="${ranges[key][1]}" step="1" aria-describedby="error-${key}"><span>${unit}</span></div><small>${hint}</small><span class="field-error" id="error-${key}"></span></div>`;
  const toggle=(key:string,label:string,hint:string)=>`<label class="toggle-row" for="setting-${key}"><span>${label}<small>${hint}</small></span><input id="setting-${key}" name="${key}" type="checkbox" role="switch"><span class="switch-track" aria-hidden="true"></span></label>`;
  host.innerHTML=settingsTemplate({desktop,symbol,numeric,toggle});
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>host.querySelector<T>(`#${id}`)!;
  const form=$<HTMLFormElement>('settings-form');
  function showTab(name:string,focus=false){
    host.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(panel=>{panel.hidden=panel.dataset.settingsPanel!==name;});
    host.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach(button=>{const selected=button.dataset.settingsTab===name;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected&&focus)button.focus();});
    $('settings-fields').scrollTop=0;
  }
  const tabs=[...host.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
  tabs.forEach((button,index)=>{button.onclick=()=>showTab(button.dataset.settingsTab!);button.onkeydown=e=>{const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(next>=0){e.preventDefault();showTab(tabs[next].dataset.settingsTab!,true);}};});
  let snapshot:Snapshot={settings:{...defaults},hasApiKey:false};let loaded=false;let saving=false;let testing=false;let removeKey=false;let dirty=false;
  const input=(key:string)=>$<HTMLInputElement>(`setting-${key}`);
  function read():Settings {
    const s={...snapshot.settings};
    for(const key of Object.keys(defaults) as (keyof Settings)[]){if(key==='schemaVersion'||key==='baseUrl'||key==='apiTestPath')continue;const el=input(key);(s as unknown as Record<string,unknown>)[key]=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?el.valueAsNumber:el.value;}
    s.baseUrl=RMS_API.baseUrl;s.apiTestPath=RMS_API.storesPath;return s;
  }
  function fill(s:Settings){for(const key of Object.keys(defaults) as (keyof Settings)[]){if(key==='schemaVersion'||key==='baseUrl'||key==='apiTestPath')continue;const el=input(key);if(el.type==='checkbox')el.checked=s[key] as boolean;else el.value=String(s[key]);}input('apiKey').value='';removeKey=false;input('apiKey').type='password';$('toggle-key').setAttribute('aria-label','Tampilkan API key');}
  function keyMatches(){return keyTarget(read().baseUrl)===keyTarget(snapshot.settings.baseUrl);}
  function mark(){
    const draft=read();setCredentialAvailability(loaded&&snapshot.hasApiKey&&!removeKey);dirty=loaded&&(JSON.stringify(draft)!==JSON.stringify(snapshot.settings)||!!input('apiKey').value||removeKey);options.dirty(dirty);
    $('settings-save-status').textContent=saving?'Menyimpan…':dirty?'Perubahan belum disimpan':loaded?'Tidak ada perubahan tertunda':'Memuat pengaturan…';
    $('settings-dirty-dot').classList.toggle('unsaved',dirty);
    $<HTMLButtonElement>('settings-save').disabled=!loaded||!dirty||saving||testing;
    $<HTMLButtonElement>('settings-discard').disabled=!loaded||!dirty||saving||testing;
    $<HTMLButtonElement>('settings-reset').disabled=!loaded||saving||testing;
    $<HTMLButtonElement>('test-api').disabled=!loaded||saving||testing;
    $<HTMLButtonElement>('remove-key').disabled=!snapshot.hasApiKey||!keyMatches()||removeKey||testing||saving;
    $('key-status').textContent=removeKey?'Akan dihapus':input('apiKey').value?'API key baru':snapshot.hasApiKey&&keyMatches()?'API key tersimpan':'API key belum diisi';
    $('key-help').textContent=removeKey?'API key akan dihapus setelah perubahan disimpan.':snapshot.hasApiKey&&keyMatches()?'Kosongkan kolom ini untuk mempertahankan key tersimpan.':!keyMatches()&&snapshot.hasApiKey?'URL berubah. Masukkan key untuk website ini.':desktop?'API key disimpan aman di perangkat Anda.':'Preview menyimpan key dalam memori; key hilang saat halaman dimuat ulang.';
    input('apiKey').placeholder=snapshot.hasApiKey&&keyMatches()&&!removeKey?'API key tersimpan — isi untuk mengganti':'Masukkan rms_live_…';
    $('filename-preview').textContent=draft.useCustomTitle?'[Judul custom].jpg':'[ID produk]-[nomor].jpg';
    $('opacity-value').textContent=`${draft.glassOpacity}%`;
    const delays=Array.from({length:Math.min(Math.max(draft.requestMaxAttempts-1,0),4)},(_,i)=>Math.min(draft.retryInitialSeconds*(draft.retryBackoff?2**i:1),draft.retryMaxSeconds));
    $('retry-preview').textContent=delays.length&&delays.every(Number.isFinite)?`Urutan jeda: ${delays.join(' → ')} detik${draft.requestMaxAttempts>5?' → …':''}`:'Permintaan dikirim satu kali, tanpa percobaan ulang.';
  }
  function errors(values:Errors){host.querySelectorAll('.field-error').forEach(e=>e.textContent='');host.querySelectorAll('[aria-invalid]').forEach(e=>e.removeAttribute('aria-invalid'));tabs.forEach(t=>t.classList.remove('has-error'));for(const [key,message]of Object.entries(values)){const el=host.querySelector(`#error-${key}`);if(el)el.textContent=message!;input(key)?.setAttribute('aria-invalid','true');const panel=input(key)?.closest<HTMLElement>('[data-settings-panel]');if(panel)$('settings-tab-'+panel.dataset.settingsPanel).classList.add('has-error');}const first=Object.keys(values)[0];if(first){const el=input(first);const panel=el?.closest<HTMLElement>('[data-settings-panel]');if(panel)showTab(panel.dataset.settingsPanel!);el?.focus();}return !!first;}
  function clearTest(){testing=false;$('api-test-result').innerHTML='';$('test-api').innerHTML=`${symbol('radio')} Uji koneksi`;options.icons();}
  async function load(){try{snapshot=await loadSettings();fill(snapshot.settings);applyAppearance(snapshot.settings);loaded=true;$<HTMLFieldSetElement>('settings-fields').disabled=false;mark();}catch(e){$('settings-save-status').textContent='Pengaturan belum dapat dimuat';$('settings-load-error').hidden=false;$('settings-load-error').textContent=String(e instanceof Error?e.message:e);options.toast('Pengaturan gagal dimuat. Data lama tidak diubah.',true);}}
  form.addEventListener('input',e=>{if((e.target as HTMLElement).id==='setting-apiKey')removeKey=false;if(['setting-apiKey','setting-baseUrl','setting-apiTestPath'].includes((e.target as HTMLElement).id)){$('api-test-result').innerHTML='';}mark();});form.addEventListener('change',mark);
  $('toggle-key').addEventListener('click',()=>{const el=input('apiKey');const visible=el.type==='password';el.type=visible?'text':'password';$('toggle-key').setAttribute('aria-label',visible?'Sembunyikan API key':'Tampilkan API key');});
  $('remove-key').addEventListener('click',()=>{input('apiKey').value='';removeKey=true;clearTest();mark();});
  $('settings-discard').addEventListener('click',()=>{fill(snapshot.settings);errors({});clearTest();mark();options.toast('Perubahan dibatalkan. Pengaturan sebelumnya dipertahankan.',false,'info');});
  $('settings-reset').addEventListener('click',()=>{const current=read();const key=input('apiKey').value;const pendingRemoval=removeKey;fill({...defaults,baseUrl:current.baseUrl,apiTestPath:current.apiTestPath});input('apiKey').value=key;removeKey=pendingRemoval;errors({});clearTest();mark();options.toast('Pengaturan awal dipulihkan. Simpan perubahan untuk menerapkannya. API key tetap tersimpan.',false,'info');});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!loaded||saving||testing)return;const settings=read();const values=validateSettings(settings);const key=input('apiKey').value;
    if(key&&validateKey(key))values.apiKey=validateKey(key);if((key||removeKey)&&!settings.baseUrl)values.baseUrl='Isi URL website untuk menyimpan API key.';
    if(errors(values)){options.toast('Periksa kolom yang ditandai sebelum menyimpan.',false,'warning');return;}saving=true;$<HTMLFieldSetElement>('settings-fields').disabled=true;mark();
    try{snapshot=await saveSettings({settings,keyAction:key?'set':removeKey?'remove':'keep',...(key?{apiKey:key}:{})});fill(snapshot.settings);applyAppearance(snapshot.settings);$('settings-save-detail').textContent=`Disimpan ${new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date())} WIB · Berlaku untuk pekerjaan berikutnya.`;options.event?.({level:'success',category:'settings',title:'Pengaturan berhasil disimpan',message:`Preferensi pengiriman, retry, tema ${snapshot.settings.theme}, bahasa ${snapshot.settings.language}, dan tampilan diperbarui. API key tetap dilindungi dan tidak dicatat.`});options.toast('Perubahan pengaturan berhasil disimpan.');}
    catch(e){options.event?.({level:'error',category:'settings',title:'Penyimpanan pengaturan gagal',message:String(e instanceof Error?e.message:e)});options.toast(String(e instanceof Error?e.message:e),true);}
    finally{saving=false;$<HTMLFieldSetElement>('settings-fields').disabled=false;mark();}
  });
  $('test-api').addEventListener('click',async()=>{
    if(testing||saving||!loaded)return;const settings=read();const validation=validateSettings(settings);const values:Errors={};for(const field of ['baseUrl','apiTestPath','requestTimeoutSeconds'] as const)if(validation[field])values[field]=validation[field];if(!settings.baseUrl)values.baseUrl='Isi URL website sebelum mengetes API key.';
    const key=input('apiKey').value;if(key&&validateKey(key))values.apiKey=validateKey(key);if(!key&&(removeKey||!snapshot.hasApiKey||!keyMatches()))values.apiKey='Masukkan API key Rizky Moto AI.';if(errors(values)){options.toast('Isi API key yang valid sebelum menjalankan tes.',false,'warning');return;}
    options.event?.({level:'info',category:'api',title:'Uji koneksi dimulai',message:'Memeriksa akses katalog toko Rizky Moto AI.',notify:false});
    testing=true;$<HTMLFieldSetElement>('settings-fields').disabled=true;mark();$('test-api').innerHTML=`${symbol('loader-circle')} Menguji…`;$('api-test-result').textContent='Memeriksa akses ke Rizky Moto AI…';options.icons();
    try{const response=await testApi(settings,key||undefined);const box=$('api-test-result');box.classList.toggle('verified',response.code==='valid');box.replaceChildren();const heading=document.createElement('strong');heading.textContent=response.code==='valid'?'Koneksi berhasil':response.code==='unauthorized'?'API key tidak valid':response.code==='forbidden'?'Akses API key terbatas':'Koneksi belum berhasil';const message=document.createElement('p');message.textContent=response.message;const meta=document.createElement('small');meta.textContent=`${response.httpStatus?`HTTP ${response.httpStatus} · `:''}${response.latencyMs.toLocaleString('id')} ms`;box.append(heading,message,meta);if(response.stores?.length){const stores=document.createElement('div');stores.className='available-stores';stores.setAttribute('aria-label','Toko yang tersedia');for(const store of response.stores){const chip=document.createElement('span');chip.textContent=store.name;stores.append(chip);}box.append(stores);}options.event?.({level:response.code==='valid'?'success':response.code==='forbidden'?'warning':'error',category:'api',title:heading.textContent,message:response.message});}
    catch(e){$('api-test-result').classList.remove('verified');$('api-test-result').textContent=String(e instanceof Error?e.message:e);options.event?.({level:'error',category:'api',title:'Uji koneksi gagal',message:'API key tidak dapat diverifikasi. Periksa koneksi dan pengaturan.'});}
    finally{testing=false;$<HTMLFieldSetElement>('settings-fields').disabled=false;$('test-api').innerHTML=`${symbol('radio')} Uji koneksi`;mark();options.icons();}
  });
  options.icons();void load();return {isDirty:()=>dirty,isBusy:()=>saving||testing};
}
