import { describe, it, expect } from 'vitest';
import { scan, manifest, type Source, type Entry } from './scanner';
const text = (s: string) => new TextEncoder().encode(s);
const jpg = new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1]);
function memory(files: Record<string, Uint8Array>, denied = ''): Source {
  return { name: 'Foto Mentah', root: 'D:\\Foto Mentah',
    async list(path) {
      if (path && path === denied) throw new Error('denied');
      const entries = new Map<string, Entry>();
      for (const p of Object.keys(files)) {
        const prefix = path ? `${path}/` : ''; if (!p.startsWith(prefix)) continue;
        const relative = p.slice(prefix.length); const parts = relative.split('/');
        entries.set(parts[0], { name: parts[0], kind: parts.length > 1 ? 'directory' : 'file' });
      }
      return [...entries.values()];
    },
    async read(path, limit) { if (!files[path]) throw new Error('missing'); return limit ? files[path].slice(0,limit) : files[path]; },
    async size(path) { return files[path].length; }
  };
}
describe('folder analysis and ready-only manifests', () => {
  it('rejects images larger than the real API upload limit',async()=>{const source=memory({'foto produk.jpg':jpg,'judul.txt':text('Judul')});const size=source.size;source.size=async path=>path.endsWith('.jpg')?10*1024*1024+1:size(path);const result=await scan(source);expect(result.products).toHaveLength(0);expect(result.issues[0].message).toContain('10 MB');expect(()=>manifest(result)).toThrow();});
  it('matches named files within each leaf, preserves hierarchy and exact title, optional installed photo', async () => {
    const source = memory({
      'Yamaha/Aerox/Spakbor/1 PCS/Slash/Foto Produk.JPG': jpg,
      'Yamaha/Aerox/Spakbor/1 PCS/Slash/JUDUL.TXT': text('\ufeffBAUT SLASH 1 PCS\r\nJudul asli'),
      'Yamaha/Aerox/Spakbor/1 Set/foto produk.jpeg': jpg,
      'Yamaha/Aerox/Spakbor/1 Set/foto produk terpasang.jpg': jpg,
      'Yamaha/Aerox/Spakbor/1 Set/judul.txt': text('BAUT 1 SET'),
      'Hasil Generate/Toko/produk/foto produk.jpg': jpg,
      'Hasil Generate/Toko/produk/judul.txt': text('Jangan ikut'),
    });
    const result = await scan(source);
    expect(result.products).toHaveLength(2); expect(result.skipped).toBe(1);
    expect(result.products.find(p => p.folder.endsWith('Slash'))?.installedPhoto).toBeNull();
    expect(result.products.find(p => p.folder.endsWith('Slash'))?.title).toBe('BAUT SLASH 1 PCS\r\nJudul asli');
    expect(result.products[0].hierarchy).toContain('Yamaha');
    expect(manifest(result)).toMatchObject({ status: 'ready', outputDirectory: 'Hasil Generate', pathMode: 'relative-to-source' });
  });
  it('omits incomplete entries while keeping ready products available', async () => {
    const result = await scan(memory({
      'Valid/foto produk.jpg': jpg, 'Valid/judul.txt': text('Siap'),
      'Missing/judul.txt': text('Tanpa foto'),
      'Empty/foto produk.jpg': jpg, 'Empty/judul.txt': text('  '),
      'Duplicate/foto produk.jpg': jpg, 'Duplicate/foto produk.jpeg': jpg, 'Duplicate/judul.txt': text('Ganda'),
      'Broken/foto produk.jpg': text('not an image'), 'Broken/judul.txt': text('Rusak'),
      'Denied/judul.txt': text('No access'),
    }, 'Denied'));
    expect(result.products).toHaveLength(1); expect(result.issues).toHaveLength(5);
    expect(manifest(result).products).toHaveLength(1);
  });
  it('does not treat legacy filenames or media as ready products', async () => {
    const result = await scan(memory({'AEROX/1 PCS.jpg':jpg,'AEROX/MODEL.txt':text('legacy'),'AEROX/video.mp4':text('video')}));
    expect(result.candidates).toBe(0); expect(result.files).toBe(3);
    expect(() => manifest(result)).toThrow();
  });
  it('supports selecting a single product folder and unicode titles', async () => {
    const result = await scan(memory({'foto produk.jpg':jpg,'judul.txt':text('Baut “Slash” — 1 PCS')}));
    expect(result.products[0].folder).toBe(''); expect(result.products[0].title).toBe('Baut “Slash” — 1 PCS');
    expect(result.products[0].productPhoto).toBe('foto produk.jpg');
  });
  it('cancels cleanly and cannot export a cancelled scan', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(scan(memory({'judul.txt':text('test')}), undefined, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps stable identity across repeated scans and reads only image headers', async () => {
    const source = memory({'foto produk.jpg':jpg,'judul.txt':text('judul')});
    const original = source.read; const lengths: (number | undefined)[] = [];
    source.read = async (p, limit) => { if(p.endsWith('.jpg')) lengths.push(limit); return original(p,limit); };
    expect((await scan(source)).products[0].id).toBe((await scan(source)).products[0].id);
    expect(lengths).toEqual([16,16]);
  });
});
