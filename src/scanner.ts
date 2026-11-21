export interface Entry { name: string; kind: 'file' | 'directory' | 'symlink'; }
export interface Source {
  name: string;
  root: string;
  list(path: string): Promise<Entry[]>;
  read(path: string, limit?: number): Promise<Uint8Array>;
  size(path: string): Promise<number>;
  save?(name: string, content: string): Promise<void>;
}
export interface Product {
  id: string;
  folder: string;
  hierarchy: string[];
  title: string;
  productPhoto: string;
  installedPhoto: string | null;
  titleFile: string;
  status: 'ready';
  identity: ProductIdentity;
  referenceMode: 'product-only' | 'product-and-installed' | 'installed-only';
}
export interface ProductIdentity {
  brand: string | null;
  motorcycle: string | null;
  part: string | null;
  salesLabel: string | null;
  salesType: 'pcs' | 'set' | 'satuan' | 'paketan' | null;
  quantity: number | null;
  model: string | null;
}
export interface Issue { folder: string; message: string; blocking: boolean; }
export interface ScanResult {
  sourceRoot: string;
  sourceName: string;
  createdAt: string;
  products: Product[];
  issues: Issue[];
  folders: number;
  files: number;
  skipped: number;
  candidates: number;
}
export interface ScanProgress { folders: number; files: number; found: number; ready: number; current: string; }
export const excluded = new Set(['hasil generate', 'moto-studio', 'node_modules', '.git', '.moto-studio', '$recycle.bin', 'system volume information']);
const join = (a: string, b: string) => a ? `${a}/${b}` : b;
const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id');
const photoPattern = /^foto produk\.(jpg|jpeg|png|webp)$/;
const installedPattern = /^(?:contoh )?foto produk terpasang\.(jpg|jpeg|png|webp)$/;
const titlePattern = /^judul(?: produk)?\.txt$/;
function folderIdentity(source: Source, folder: string): ProductIdentity {
  const segments=[...source.root.split(/[\\/]+/).filter(Boolean),...folder.split('/').filter(Boolean)];
  const brandIndex=segments.map(s=>['yamaha','honda','suzuki','kawasaki'].includes(norm(s))).lastIndexOf(true);
  const brand=brandIndex>=0?segments[brandIndex]:null;
  const motorcycle=brandIndex>=0?segments[brandIndex+1]||null:null;
  const part=brandIndex>=0?segments[brandIndex+2]||null:null;
  const variants=brandIndex>=0?segments.slice(brandIndex+3):[];
  const saleIndex=variants.findIndex(s=>/^(?:\d+\s*(?:pcs|set)|satuan|paketan|paket)$/i.test(s.trim()));
  const salesLabel=saleIndex>=0?variants[saleIndex]:part?.match(/(?:^|\s)(\d+\s*(?:pcs|set))(?=\s|$)/i)?.[1]||null;
  const quantityMatch=salesLabel?.match(/^(\d+)\s*(pcs|set)$/i);
  const quantity=quantityMatch?Number(quantityMatch[1]):null;
  const salesType:ProductIdentity['salesType']=quantityMatch?quantityMatch[2].toLowerCase() as 'pcs'|'set':salesLabel&&/^satuan$/i.test(salesLabel)?'satuan':salesLabel&&/^paket(?:an)?$/i.test(salesLabel)?'paketan':null;
  const models=variants.filter((_,index)=>index!==saleIndex);
  return {brand,motorcycle,part,salesLabel,salesType,quantity,model:models.length?models.join(' / '):null};
}
function stableId(path: string) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(path.normalize('NFC'))) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return `product-${hash.toString(16).padStart(8, '0')}`;
}
function decodeTitle(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes).trim();
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes).trim();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim(); }
  catch { return new TextDecoder('windows-1252').decode(bytes).trim(); }
}
function validImage(bytes: Uint8Array, name: string) {
  const ext = name.split('.').at(-1)?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (ext === 'png') return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (ext === 'webp') return new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  return false;
}
export async function scan(source: Source, onProgress: (p: ScanProgress) => void = () => {}, signal?: AbortSignal): Promise<ScanResult> {
  const result: ScanResult = { sourceRoot: source.root, sourceName: source.name, createdAt: new Date().toISOString(), products: [], issues: [], folders: 0, files: 0, skipped: 0, candidates: 0 };
  const abort = () => { if (signal?.aborted) throw new DOMException('Analisis dibatalkan', 'AbortError'); };
  const visit = async (folder: string): Promise<void> => {
    abort();
    let entries: Entry[];
    try { entries = await source.list(folder); }
    catch { result.issues.push({ folder, message: 'Folder tidak dapat dibaca. Periksa akses folder.', blocking: true }); return; }
    result.folders++;
    const files = entries.filter(e => e.kind === 'file');
    result.files += files.length;
    const photos = files.filter(e => photoPattern.test(norm(e.name)));
    const installed = files.filter(e => installedPattern.test(norm(e.name)));
    const titles = files.filter(e => titlePattern.test(norm(e.name)));
    if (!titles.length && (photos.length || installed.length)) {
      result.issues.push({folder,message:'JUDUL PRODUK.txt belum tersedia. Folder ini belum dihitung sebagai produk.',blocking:false});
    }
    if (titles.length) {
      result.candidates++;
      const errors: string[] = [];
      if (photos.length > 1) errors.push('Ada lebih dari satu foto produk. Sisakan satu file.');
      if (!photos.length && !installed.length) errors.push('Foto referensi belum tersedia. Tambahkan foto produk atau foto terpasang.');
      if (installed.length > 1) errors.push('Ada lebih dari satu foto produk terpasang. Sisakan satu file.');
      if (titles.length !== 1) errors.push('Ada lebih dari satu file judul. Gunakan satu JUDUL PRODUK.txt per produk.');
      let title = '';
      if (titles.length === 1) {
        try {
          const path = join(folder, titles[0].name);
          if (await source.size(path) > 262144) errors.push('File judul terlalu besar (maksimal 256 KB).');
          else { title = decodeTitle(await source.read(path)); if (!title || title.includes('\0')) errors.push('Judul kosong atau format teks tidak valid.'); }
        } catch { errors.push('File judul tidak dapat dibaca.'); }
      }
      for (const photo of [...photos, ...installed]) {
        abort();
        try { const path=join(folder,photo.name); if(await source.size(path)>10*1024*1024)errors.push(`${photo.name}: ukuran melebihi batas API 10 MB per file.`); else if (!validImage(await source.read(path, 16), photo.name)) errors.push(`${photo.name}: isi file tidak sesuai format gambar.`); }
        catch { errors.push(`${photo.name} tidak dapat dibaca.`); }
      }
      if (errors.length) errors.forEach(message => result.issues.push({ folder, message, blocking: true }));
      else result.products.push({ id: stableId(folder || source.name), folder, hierarchy: folder ? folder.split('/') : [], title, productPhoto: join(folder, (photos[0]||installed[0]).name), installedPhoto: photos[0]&&installed[0] ? join(folder, installed[0].name) : null, titleFile: join(folder, titles[0].name), status: 'ready',identity:folderIdentity(source,folder),referenceMode:photos[0]?(installed[0]?'product-and-installed':'product-only'):'installed-only' });
    }
    onProgress({ folders: result.folders, files: result.files, found: result.candidates, ready: result.products.length, current: folder || source.name });
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name, 'id', { numeric: true }))) {
      abort();
      if (entry.kind === 'symlink') { result.skipped++; continue; }
      if (entry.kind !== 'directory') continue;
      if (excluded.has(norm(entry.name)) || entry.name.startsWith('.')) { result.skipped++; continue; }
      await visit(join(folder, entry.name));
    }
  };
  await visit('');
  abort();
  return result;
}
export function manifest(result: ScanResult) {
  if (!result.products.length) throw new Error('Manifest belum siap. Belum ada produk dengan judul dan foto referensi yang valid.');
  return { schemaVersion: 1, app: 'KSMARJAA TOOLS AI', status: 'ready', createdAt: result.createdAt, sourceRoot: result.sourceRoot, sourceName: result.sourceName, pathMode: 'relative-to-source', outputDirectory: 'Hasil Generate', outputPattern: '{storeName}/{product.folder}/{filename}', analysisSummary:{productsFromTitles:result.candidates,readyProducts:result.products.length,omittedFolders:new Set(result.issues.map(issue=>issue.folder)).size},products: result.products };
}
