import './style.css';
import './theme.css';
import './i18n';
import './preferences.css';
import './page-guides.css';
import {loadSettings,applyAppearance} from './settings-client';
import { mountSettings } from './settings-view';
import { analysisLayout } from './analysis-layout';
import { publish, type Level, type Category } from './activity';
import { mountNotifications } from './notifications';
import { mountActivity } from './activity-view';
import { mountManifest } from './manifest-view';
import { mountGenerate } from './generate-view';
import '@fontsource-variable/inter';
import './typography.css';
import './light-contrast.css';
import './interaction-polish.css';
import './studio-appearance.css';
import { createIcons, FolderSearch, Layers3, WandSparkles, Settings2, FolderOpen, ArrowUpRight, ArrowRight, ScanLine, FileText, FolderTree, X, Search, Download, ChevronRight, CircleHelp, Square, Minus, Maximize2, AlertCircle, RefreshCw, Shield, ShieldCheck, ShieldAlert, FolderCheck, FolderOutput, Store, KeyRound, Database, RotateCcw, Trash2, SlidersHorizontal, PlugZap, Eye, Radio, LoaderCircle, Info, Save, LockKeyhole, Clock3, CircleCheck, CircleX, TriangleAlert, ChevronLeft } from 'lucide';
import { chooseSource, desktop } from './source';
import { scan, manifest, type Source, type ScanResult, type ScanProgress } from './scanner';
if (desktop) document.documentElement.classList.add('desktop');
void loadSettings().then(snapshot=>applyAppearance(snapshot.settings)).catch(()=>{/* Keep the built-in dark/Indonesian defaults when settings are unavailable. */});
const icons = { FolderSearch, Layers3, WandSparkles, Settings2, FolderOpen, ArrowUpRight, ArrowRight, ScanLine, FileText, FolderTree, X, Search, Download, ChevronRight, CircleHelp, Square, Minus, Maximize2, AlertCircle, RefreshCw, Shield, ShieldCheck, ShieldAlert, FolderCheck, FolderOutput, Store, KeyRound, Database, RotateCcw, Trash2, SlidersHorizontal, PlugZap, Eye, Radio, LoaderCircle, Info, Save, LockKeyhole, Clock3, CircleCheck, CircleX, TriangleAlert, ChevronLeft };
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let source: Source | null = null;
let result: ScanResult | null = null;
let busy = false;
let savingManifest = false;
let settingsDirty = false;
let controller: AbortController | null = null;
let progress: ScanProgress | null = null;
let filter: 'all' | 'ready' | 'issues' = 'all';
let query = '';
let saved = '';
let lastResult: ScanResult | null = null;
try { lastResult = JSON.parse(localStorage.getItem('moto:last-result') || 'null'); } catch { /* Ignore stale storage. */ }
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<div class="ambient" aria-hidden="true"></div>
<div class="shell">
  <header class="titlebar"><span class="title-brand">K<span class="title-caption">KSMARJAA TOOLS AI</span></span><span class="title-mode">${desktop ? 'DESKTOP' : 'PREVIEW LOKAL'}</span><div class="window-controls">${desktop ? `<button id="minimize" aria-label="Minimalkan">${icon('minus')}</button><button id="maximize" aria-label="Maksimalkan">${icon('maximize-2')}</button><button id="close" aria-label="Tutup aplikasi">${icon('x')}</button>` : '<span class="live-dot"></span><span>Aplikasi lokal</span>'}</div></header>
  <aside class="sidebar"><a class="brand" href="#"><span class="brandmark">K</span><span class="brand-name">KSMARJAA<small>TOOLS AI</small></span></a><p class="nav-caption">MENU UTAMA</p><nav aria-label="Menu utama"><button class="nav-item active" id="analysis-nav" aria-current="page">${icon('folder-search')}<span>Analisis folder</span></button><button class="nav-item" id="manifest-nav">${icon('layers-3')}<span>Manifest</span><span id="manifest-count" class="nav-count">0</span></button><button class="nav-item" id="generate-nav">${icon('wand-sparkles')}<span>Generate</span></button><button class="nav-item" id="activity-nav">${icon('clock-3')}<span>Log aktivitas</span></button><button class="nav-item" id="settings-nav">${icon('settings-2')}<span>Pengaturan</span></button></nav><div class="sidebar-bottom"><div class="local-note">${icon('shield')}<span>Analisis lokal<small>Foto tetap di perangkat</small></span></div><div class="version"><span>Versi 0.3.12</span><span>WINDOWS</span></div></div></aside>
  <main>${analysisLayout(icon)}</main>
</div><div id="toast" role="status"></div><dialog id="guide-dialog"><div class="dialog-head"><div><span class="section-kicker">PANDUAN SUMBER</span><h2>Struktur folder produk</h2></div><button class="icon-button" id="close-guide" aria-label="Tutup panduan">${icon('x')}</button></div><p>Pilih folder di tingkat mana saja. Jalur relatif dari folder yang dipilih akan dipertahankan dalam hasil generate.</p><pre>Foto Mentah/
└── Yamaha/
    └── Aerox Nmax/
        └── Baut Spakbor Depan/
            ├── 1 PCS/
            │   └── 2 Kunci/
            │       ├── foto produk.jpg
            │       ├── CONTOH FOTO PRODUK TERPASANG.jpg
            │       └── JUDUL PRODUK.txt
            └── 1 Set/
                ├── foto produk.jpg
                └── JUDUL PRODUK.txt</pre><p>Setiap produk memerlukan judul dan minimal satu foto: foto produk atau foto terpasang. Nama file tidak peka huruf besar/kecil. Folder hasil, folder tersembunyi, dan tautan folder dilewati. Judul digunakan persis dari file teks.</p><div class="guide-output">Hasil nantinya: <code>[Folder dipilih]/Hasil Generate/[Nama toko]/[Jalur produk]</code></div></dialog>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
function drawIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.65 } }); }
function toast(message: string, error = false, level?: Level, category:Category='analysis',persist=true) { publish({level:level||(error?'error':'success'),category,message,persist}); }

function empty(title: string, copy: string, symbol = 'folder-search') { return `<div class="empty-state"><div class="empty-orbit">${icon(symbol)}</div><h3>${title}</h3><p>${copy}</p></div>`; }
function renderRows() {
  const target = $('#results');
  if (busy) { target.innerHTML = `<div class="empty-state"><div class="scan-orbit">${icon('scan-line')}</div><h3>Membaca struktur folder…</h3><p id="current-folder">${esc(progress?.current || source?.name || '')}</p><span class="empty-caption">Foto tidak diunggah ke mana pun</span></div>`; drawIcons(); return; }
  if (!result) { target.innerHTML = empty('Belum ada hasil analisis', 'Pilih folder sumber, lalu klik Mulai analisis.<br>Foto dan judul produk akan diperiksa secara otomatis.'); drawIcons(); return; }
  if (!result.candidates && !result.issues.length) { target.innerHTML = empty('Struktur produk belum dikenali', 'Gunakan nama <strong>foto produk.jpg</strong> dan <strong>JUDUL PRODUK.txt</strong><br>di setiap folder produk. Buka panduan untuk melihat contohnya.','folder-open'); drawIcons(); return; }
  const search = query.toLocaleLowerCase('id');
  const products = filter === 'issues' ? [] : result.products.filter(p => `${p.title} ${p.folder}`.toLocaleLowerCase('id').includes(search));
  const issues = filter === 'ready' ? [] : result.issues.filter(i => `${i.message} ${i.folder}`.toLocaleLowerCase('id').includes(search));
  const rows = [...products.map(p => `<tr><td><span class="product-title">${esc(p.title)}</span><span class="product-path">${esc(p.folder || source?.name || result!.sourceName)}</span></td><td><span class="file-tag">${p.installedPhoto ? '2 foto' : '1 foto'}</span><small>${p.referenceMode==='installed-only'?'Foto terpasang':p.installedPhoto?'Produk & terpasang':'Foto produk'}</small></td><td><span class="ready-label"><span class="tiny-dot"></span>Siap</span></td></tr>`), ...issues.map(i => `<tr class="issue-row"><td><span class="product-title">${esc(i.folder || result!.sourceName)}</span><span class="issue-message">${esc(i.message)}</span></td><td>—</td><td><span class="issue-label">Periksa</span></td></tr>`)];
  target.innerHTML = rows.length ? `<table><thead><tr><th>PRODUK</th><th>FOTO</th><th>STATUS</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : empty('Produk tidak ditemukan', 'Ubah kata pencarian atau pilih filter lain.', 'search');
  drawIcons();
}
function update() {
  $('#source-name').textContent = source?.name || 'Pilih folder produk';
  $('#source-path').textContent = source ? source.root : 'Pilih folder motor, komponen, atau seluruh koleksi produk.';
  $('#choose').innerHTML = `${icon('folder-open')} ${source ? 'Ganti folder' : 'Pilih folder'} ${icon('arrow-up-right')}`;
  ($('#choose') as HTMLButtonElement).disabled = busy;
  ($('#analyze') as HTMLButtonElement).disabled = !source;
  $('#analyze').innerHTML = busy ? `${icon('square')} Batalkan analisis` : `${icon('scan-line')} ${result ? 'Periksa ulang' : 'Mulai analisis'} ${icon('arrow-right')}`;
  ($('#save') as HTMLButtonElement).disabled = busy || savingManifest || !source?.save || !result?.products.length;
  ($('#rescan') as HTMLButtonElement).disabled = busy || !source;
  const badFolders = result ? new Set(result.issues.map(i => i.folder)).size : 0;
  $('#folders-value').textContent = String(busy ? progress?.folders || 0 : result?.folders ?? '—');
  $('#found-value').textContent = String(busy ? progress?.found || 0 : result?.candidates ?? '—');
  $('#ready-value').textContent = String(busy ? progress?.ready || 0 : result?.products.length ?? '—');
  $('#issues-value').textContent = String(result ? badFolders : '—');
  $('#result-count').textContent = String(result?.candidates || 0);
  $('#file-count').textContent = result ? `${result.files.toLocaleString('id')} file · ${result.skipped} folder/tautan dilewati` : 'Belum ada file diperiksa';
  $('#result-subtitle').textContent = busy ? 'Memeriksa struktur folder dan kelengkapan file.' : result ? `${result.products.length} produk siap diproses${badFolders ? ` · ${badFolders} folder perlu diperbaiki` : ''}.` : 'Hasil pemeriksaan folder akan muncul di sini.';
  $('#scan-status').innerHTML = `<span class="tiny-dot ${busy ? 'pulse' : ''}"></span> ${busy ? 'Analisis berlangsung' : result ? 'Analisis selesai' : source ? 'Folder siap diperiksa' : 'Belum ada folder dipilih'}`;
  $('#status-right').textContent = saved ? `Tersimpan: ${saved}` : result ? `${result.folders} folder dibaca · ${result.files} file ditemukan` : 'Pilih folder untuk memulai.';
  $('#save-note').textContent = saved ? 'Manifest berhasil disimpan di folder sumber.' : result?.products.length ? `${result.products.length} produk siap disimpan.${badFolders?` ${badFolders} folder belum lengkap tidak disertakan.`:''}` : result?.issues.length ? 'Lengkapi judul dan minimal satu foto referensi.' : source ? 'Jalankan analisis untuk memeriksa kelengkapan produk.' : 'Pilih folder untuk memulai.';
  $('#progress-area').innerHTML = busy ? `<div class="indeterminate"><span></span></div><p class="progress-caption">${progress?.folders || 0} folder dibaca · ${progress?.ready || 0} produk siap</p>` : '';
  renderRows(); drawIcons();
}
$('#choose').addEventListener('click', async () => {
  try { const next = await chooseSource(); if (!next) return; source = next; result = null; progress = null; saved = ''; query = ''; $('#search').setAttribute('value', ''); ($('#search') as HTMLInputElement).value = ''; update(); }
  catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message, true); }
});
async function analyze() {
  if (busy) { controller?.abort(); return; }
  if (!source) return;
  publish({level:'info',category:'analysis',title:'Analisis dimulai',message:'Membaca folder sumber dan kelengkapan produk.',notify:false});
  controller = new AbortController(); busy = true; result = null; saved = ''; progress = null; update();
  let lastDraw = 0;
  try {
    result = await scan(source, p => { progress = p; if (performance.now() - lastDraw > 100) { lastDraw = performance.now(); $('#folders-value').textContent = String(p.folders); $('#found-value').textContent = String(p.found); $('#ready-value').textContent = String(p.ready); $('#current-folder').textContent = p.current; const caption = document.querySelector('.progress-caption'); if (caption) caption.textContent = `${p.folders} folder dibaca · ${p.ready} produk siap`; } }, controller.signal);
    toast(result.issues.length ? `${result.issues.length} masalah ditemukan. Periksa hasil analisis.` : result.products.length ? `${result.products.length} produk siap disimpan sebagai manifest.` : 'Belum ada produk sesuai format. Buka panduan folder.',false,result.issues.length?'warning':result.products.length?'success':'info');
  } catch (e) { toast((e as Error).name === 'AbortError' ? 'Analisis dibatalkan. Tidak ada manifest yang disimpan.' : `Analisis gagal: ${(e as Error).message}`, (e as Error).name !== 'AbortError',(e as Error).name === 'AbortError'?'info':'error'); }
  finally { busy = false; controller = null; update(); }
}
$('#analyze').addEventListener('click', analyze); $('#rescan').addEventListener('click', analyze);
$('#save').addEventListener('click', async () => {
  if (!result || !source?.save || savingManifest) return;
  const savedResult=result, savedSource=source;
  savingManifest=true;
  const button = $('#save') as HTMLButtonElement; button.disabled = true;
  try {
    const data = manifest(savedResult);
    const name = 'manifest.json';
    await savedSource.save!(name, JSON.stringify(data, null, 2));
    if(result===savedResult&&source===savedSource)saved = name;
    lastResult = savedResult;
    manifestUI.saved(savedResult, `${savedSource.root}/.moto-studio/${name}`);
    try { localStorage.setItem('moto:last-result', JSON.stringify(savedResult)); } catch { /* Disk manifest remains authoritative. */ }
    toast('Manifest berhasil disimpan. Buka menu Manifest untuk melihat dan memilih produknya.',false,'success','manifest');
  } catch (e) { toast((e as Error).message, true,'error','manifest'); }
  finally { savingManifest=false; update(); }
});
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter as typeof filter; document.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('active', el === button)); renderRows(); }));
$('#search').addEventListener('input', () => { query = ($('#search') as HTMLInputElement).value; renderRows(); });
$('#manifest-nav').addEventListener('click', () => {
  showPage('manifest');
});
$('#guide').addEventListener('click', () => ($('#guide-dialog') as HTMLDialogElement).showModal());
$('#close-guide').addEventListener('click', () => ($('#guide-dialog') as HTMLDialogElement).close());
$('#guide-dialog').addEventListener('click', e => { if (e.target === $('#guide-dialog')) { const r = $('#guide-dialog').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) ($('#guide-dialog') as HTMLDialogElement).close(); } });
if (desktop) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => { const win = getCurrentWindow(); $('#minimize').onclick = () => void win.minimize(); $('#maximize').onclick = () => void win.toggleMaximize(); $('#close').onclick = () => { if ((busy || settingsDirty || settingsUI?.isBusy()) && !window.confirm('Masih ada proses atau pengaturan belum tersimpan. Tutup aplikasi?')) return; void win.close(); }; document.querySelector('.titlebar')?.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('button')) void win.startDragging(); }); });
}
window.addEventListener('beforeunload', e => { if (busy || settingsDirty || settingsUI?.isBusy()) { e.preventDefault(); e.returnValue = ''; } });
update();

const analysisView = document.querySelector<HTMLElement>('main')!;
analysisView.id = 'analysis-view';
const settingsView = document.createElement('main');
settingsView.id = 'settings-view'; settingsView.hidden = true;
document.querySelector('.shell')!.append(settingsView);
const settingsUI = mountSettings(settingsView, { icons: drawIcons, toast:(message,error,level)=>toast(message,error,level,'settings',level!=='info'&&level!=='warning'), event:publish, dirty(value) { settingsDirty = value; $('#settings-nav').classList.toggle('has-unsaved', value); } });
const activityView = document.createElement('main');activityView.id='activity-view';activityView.hidden=true;document.querySelector('.shell')!.append(activityView);
const notices=mountNotifications({icons:drawIcons,openActivity:()=>showPage('activity')});
mountActivity(activityView,{icons:drawIcons,ephemeral:message=>notices.show({id:crypto.randomUUID(),time:new Date().toISOString(),level:'info',category:'app',title:'Riwayat dibersihkan',message,transient:true})});
const manifestView=document.createElement('main');manifestView.id='manifest-view';manifestView.hidden=true;document.querySelector('.shell')!.append(manifestView);
const generateView=document.createElement('main');generateView.id='generate-view';generateView.hidden=true;document.querySelector('.shell')!.append(generateView);
let generateUI:ReturnType<typeof mountGenerate>;
const manifestUI=mountManifest(manifestView,{icons:drawIcons,notify:(message,error)=>toast(message,error,error?'error':'success','manifest'),analyze:()=>showPage('analysis'),count:n=>$('#manifest-count').textContent=String(n),legacy:lastResult,use:id=>{generateUI?.selectManifest(id);showPage('generate');}});
generateUI=mountGenerate(generateView,{icons:drawIcons,notify:(message,error)=>toast(message,error,error?'error':'info','generate',true),activity:entry=>publish(entry)});
function showPage(page: 'analysis' | 'settings' | 'activity' | 'manifest' | 'generate') {
  analysisView.hidden = page !== 'analysis'; settingsView.hidden = page !== 'settings'; activityView.hidden=page !== 'activity';
  manifestView.hidden=page!=='manifest';generateView.hidden=page!=='generate';
  for (const [id,selected] of [['analysis-nav', page==='analysis'], ['manifest-nav',page==='manifest'], ['settings-nav',page==='settings'],['activity-nav',page==='activity'],['generate-nav',page==='generate']] as const) { const button=$('#'+id);button.classList.toggle('active',selected); if(selected) button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); }
  document.title = 'KSMARJAA TOOLS AI — ' + (page==='settings'?'Pengaturan':page==='activity'?'Log aktivitas':page==='manifest'?'Manifest produk':page==='generate'?'Generate produk':'Analisis folder');
  localStorage.setItem('ksmarjaa:page',page); (page==='analysis'?analysisView:page==='settings'?settingsView:page==='manifest'?manifestView:page==='generate'?generateView:activityView).scrollTop=0;if(page==='generate')generateUI.refresh();
}
$('#analysis-nav').onclick = () => showPage('analysis');
$('#settings-nav').onclick = () => showPage('settings');
$('#activity-nav').onclick=()=>showPage('activity');
$('#generate-nav').onclick=()=>showPage('generate');
if (localStorage.getItem('ksmarjaa:page') === 'settings') showPage('settings');
if (localStorage.getItem('ksmarjaa:page') === 'activity') showPage('activity');
if (localStorage.getItem('ksmarjaa:page') === 'manifest') showPage('manifest');
if (localStorage.getItem('ksmarjaa:page') === 'generate') showPage('generate');
