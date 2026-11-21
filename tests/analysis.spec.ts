import { test, expect } from '@playwright/test';
test('folder selection, complete scan, search, saved ready manifest, and responsive layout', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const files: Record<string, { type: string; content: number[] | string }> = {};
    for (const [path,title,installed] of [
      ['Yamaha/Aerox Nmax/Baut Spakbor Depan/1 PCS/2 Kunci','BAUT SPAKBOR DEPAN MODEL 2 KUNCI ISI 1PCS',true],
      ['Yamaha/Aerox Nmax/Baut Spakbor Depan/1 PCS/Slash','BAUT SPAKBOR DEPAN MODEL SLASH ISI 1PCS',true],
      ['Yamaha/Aerox Nmax/Baut Spakbor Depan/2 PCS','BAUT SPAKBOR DEPAN ISI 2PCS',false],
      ['Yamaha/Aerox Nmax/Baut Spakbor Depan/1 Set','BAUT SPAKBOR DEPAN 1 SET',true],
    ]) {
      files[`${path}/judul.txt`] = { type:'text/plain',content:String(title) };
      files[`${path}/foto produk.jpg`] = { type:'image/jpeg',content:[255,216,255,224,0,16,74,70,73,70] };
      if(installed) files[`${path}/foto produk terpasang.jpg`] = { type:'image/jpeg',content:[255,216,255,224,0,16] };
    }
    const directory = (prefix: string, name: string): unknown => ({ name, kind:'directory', requestPermission:async()=> 'granted',
      async *values() {
        const entries = new Map<string,string>();
        for(const path of Object.keys(files)) { if(!path.startsWith(prefix))continue; const rest=path.slice(prefix.length).split('/');entries.set(rest[0],rest.length>1?'directory':'file'); }
        for(const [key,kind] of entries) yield { name:key,kind };
      },
      getDirectoryHandle:async (part:string)=>directory(`${prefix}${part}/`,part),
      getFileHandle:async (part:string)=>({ getFile:async()=> { const data=files[`${prefix}${part}`]; return new File([typeof data.content==='string'?data.content:new Uint8Array(data.content)],part,{type:data.type}); }, createWritable:async()=>({ write:async(content:string)=>{ (window as unknown as { __saved:string }).__saved=content; },close:async()=>{} }) })
    });
    (window as unknown as {showDirectoryPicker:unknown}).showDirectoryPicker=async()=>directory('','Foto Mentah');
  });
  await page.goto('/'); await expect(page.getByRole('heading',{name:'Analisis folder'})).toBeVisible();
  await page.screenshot({ path:'artifacts/analisis-folder-empty.png',fullPage:true,animations:'disabled' });
  await page.getByRole('button',{name:'Pilih folder'}).click();
  await page.getByRole('button',{name:'Mulai analisis',exact:true}).last().click();
  await expect(page.getByText('4 produk siap diproses.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Simpan manifest'})).toBeEnabled();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.screenshot({path:'artifacts/analisis-folder-ready.png',fullPage:true,animations:'disabled'});
  await page.getByRole('textbox',{name:'Cari produk atau folder'}).fill('Slash');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Cari produk atau folder'}).fill('');
  await page.getByRole('button',{name:'Simpan manifest'}).click();
  await expect(page.locator('#save-note')).toContainText('berhasil disimpan');
  const saved = await page.evaluate(()=>JSON.parse((window as unknown as {__saved:string}).__saved));
  expect(saved.products).toHaveLength(4); expect(saved.products.every((p:{status:string})=>p.status==='ready')).toBe(true);
  expect(saved.products.find((p:{folder:string})=>p.folder.endsWith('2 PCS')).installedPhoto).toBeNull();
  await page.getByRole('button',{name:'Panduan folder'}).click(); await expect(page.locator('#guide-dialog')).toBeVisible();
  await page.getByRole('button',{name:'Tutup panduan'}).click();
  for(const width of [1440,1100,900]) { await page.setViewportSize({width,height:1000}); expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  expect(errors).toEqual([]);
});
