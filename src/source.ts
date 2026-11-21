import type { Source, Entry } from './scanner';
export const desktop = '__TAURI_INTERNALS__' in window;
type Handle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
async function browserSource(root: Handle): Promise<Source> {
  const dirs = new Map<string, Handle>([['', root]]);
  const directory = async (path: string): Promise<Handle> => {
    const known = dirs.get(path); if (known) return known;
    let current = root;
    for (const part of path.split('/').filter(Boolean)) current = await current.getDirectoryHandle(part) as Handle;
    dirs.set(path, current); return current;
  };
  const file = async (path: string) => { const parts = path.split('/'); const name = parts.pop()!; return (await (await directory(parts.join('/'))).getFileHandle(name)).getFile(); };
  return {
    name: root.name, root: root.name,
    async list(path) { const entries: Entry[] = []; for await (const handle of (await directory(path)).values()) entries.push({ name: handle.name, kind: handle.kind }); return entries; },
    async read(path, limit) { const f = await file(path); return new Uint8Array(await (limit ? f.slice(0,limit) : f).arrayBuffer()); },
    async size(path) { return (await file(path)).size; },
    async save(name, content) {
      const permissionRoot = root as Handle & { requestPermission(o: {mode: string}): Promise<string> };
      if (await permissionRoot.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Izin menulis belum diberikan. Manifest belum disimpan.');
      const dir = await root.getDirectoryHandle('.moto-studio', { create: true });
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable(); await writable.write(content); await writable.close();
    }
  };
}
export async function chooseSource(): Promise<Source | null> {
  if (!desktop) {
    const browserWindow = window as Window & { showDirectoryPicker?: (options: {mode: string}) => Promise<Handle> };
    if (!browserWindow.showDirectoryPicker) throw new Error('Pemilih folder membutuhkan Chrome atau Edge versi desktop.');
    return browserSource(await browserWindow.showDirectoryPicker({ mode: 'read' }));
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const root = await open({ directory: true, multiple: false, recursive: true, title: 'Pilih folder foto produk' });
  if (!root) return null;
  const fs = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  const abs = (path: string) => join(root, ...path.split('/').filter(Boolean));
  return {
    name: root.split(/[\\/]/).filter(Boolean).at(-1) || root, root,
    async list(path) { return (await fs.readDir(await abs(path))).map(e => ({ name: e.name, kind: e.isSymlink ? 'symlink' : e.isDirectory ? 'directory' : 'file' })); },
    async read(path, limit) {
      if (!limit) return fs.readFile(await abs(path));
      const file = await fs.open(await abs(path), { read: true });
      try { const bytes = new Uint8Array(limit); const count = await file.read(bytes); return bytes.slice(0, count || 0); }
      finally { await file.close(); }
    },
    async size(path) { return (await fs.stat(await abs(path))).size; },
    async save(name, content) {
      const dir = await abs('.moto-studio');
      await fs.mkdir(dir, { recursive: true });
      // Stage the complete JSON before replacing the previous manifest.
      const temporary=await join(dir, `${name}.tmp`);
      await fs.writeTextFile(temporary, content);
      await fs.rename(temporary, await join(dir, name));
    }
  };
}
