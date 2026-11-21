import {test,expect} from '@playwright/test';
test('settings persist, protect API key, test authentication, reset and preserve analysis navigation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let mode:'valid'|'unauthorized'|'forbidden'|'old_contract'|'html'|'missing'='valid';let count=0;
  await page.route('https://rizkymotoshop.my.id/api/v1/catalog/stores',async route=>{
    count++;const auth=route.request().headers()['authorization'];
    if(mode==='html')return route.fulfill({status:200,contentType:'text/html',body:'<html>Login</html>'});
    if(mode==='missing')return route.fulfill({status:404,contentType:'application/json',body:'{}'});
    if(mode==='forbidden')return route.fulfill({status:403,contentType:'application/json',body:'{}'});
    if(mode==='old_contract')return route.fulfill({status:200,contentType:'application/json',body:'{"authenticated":true}'});
    if(mode==='unauthorized'||auth!=='Bearer dummy-test-key-not-real')return route.fulfill({status:401,contentType:'application/json',body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[{id:1,name:'KY Online Shop',templates_count:1},{id:2,name:'Rizky Moto Shop',templates_count:1},{id:3,name:'Syakira Online Shop',templates_count:1},{id:4,name:'ZAR Online Shop',templates_count:1}]})});
  });
  await page.goto('/');await page.getByRole('button',{name:'Pengaturan',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Pengaturan'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Simpan perubahan'})).toBeDisabled();
  await expect(page.getByLabel('URL website',{exact:true})).toHaveCount(0);
  await expect(page.getByText('rizkymotoshop.my.id',{exact:true})).toBeVisible();
  await page.getByLabel('API key',{exact:true}).fill('dummy-test-key-not-real');
  await page.getByRole('tab',{name:'Pengiriman',exact:true}).click();
  await page.locator('#setting-batchSize').fill('25');
  await page.getByLabel('Jeda antarbatch',{exact:true}).fill('30');
  await page.getByRole('tab',{name:'Koneksi API',exact:true}).click();
  await page.getByRole('button',{name:'Uji koneksi'}).click();
  await expect(page.locator('#api-test-result strong')).toHaveText('Koneksi berhasil');expect(count).toBe(1);await expect(page.locator('.available-stores')).toContainText('Rizky Moto');
  await page.getByRole('button',{name:'Simpan perubahan'}).click();
  await expect(page.locator('#settings-save-status')).toHaveText('Tidak ada perubahan tertunda');
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(stored).not.toContain('dummy-test-key-not-real');expect(await page.getByLabel('API key',{exact:true}).inputValue()).toBe('');
  await page.getByRole('tab',{name:'Pengiriman',exact:true}).click();await page.locator('#setting-batchSize').fill('0');await page.getByRole('tab',{name:'Koneksi API',exact:true}).click();await page.getByRole('button',{name:'Simpan perubahan'}).click();await expect(page.locator('#error-batchSize')).not.toBeEmpty();await expect(page.getByRole('tab',{name:'Pengiriman',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Batalkan',exact:true}).click();await expect(page.locator('#setting-batchSize')).toHaveValue('25');
  await page.reload();await expect(page.getByRole('heading',{name:'Pengaturan'})).toBeVisible();await expect(page.locator('#setting-batchSize')).toHaveValue('25');await expect(page.locator('#key-status')).toHaveText('API key belum diisi');
  await page.getByLabel('API key',{exact:true}).fill('dummy-test-key-not-real');
  for(const [next,message] of [['unauthorized','API key tidak valid'],['forbidden','Akses API key terbatas'],['old_contract','Koneksi belum berhasil'],['html','Koneksi belum berhasil'],['missing','Koneksi belum berhasil']] as const){mode=next;await page.getByRole('button',{name:'Uji koneksi'}).click();await expect(page.locator('#api-test-result strong')).toHaveText(message);}
  mode='valid';await page.getByRole('button',{name:'Uji koneksi'}).click();await expect(page.locator('#api-test-result strong')).toHaveText('Koneksi berhasil');
  await page.getByRole('button',{name:'Simpan perubahan'}).click();await expect(page.locator('#settings-save-status')).toHaveText('Tidak ada perubahan tertunda');
  while(await page.locator('#notifications .floating-notice').count()){const count=await page.locator('#notifications .floating-notice').count();await page.locator('#notifications .notice-close').first().click();await expect(page.locator('#notifications .floating-notice')).toHaveCount(count-1);}
  await page.setViewportSize({width:1366,height:768});await expect(page.locator('.available-stores>span')).toHaveCount(4);await page.screenshot({path:'artifacts/pengaturan.png',animations:'disabled'});
  await page.getByRole('button',{name:'Hapus API key tersimpan'}).click();await expect(page.locator('#key-status')).toHaveText('Akan dihapus');await page.getByRole('button',{name:'Simpan perubahan'}).click();await expect(page.locator('#key-status')).toHaveText('API key belum diisi');
  await page.getByRole('button',{name:'Pulihkan pengaturan',exact:true}).click();await expect(page.locator('#setting-batchSize')).toHaveValue('10');await expect(page.getByLabel('URL website',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Simpan perubahan'}).click();
  await page.locator('#analysis-nav').click();await expect(page.getByRole('heading',{name:'Analisis folder'})).toBeVisible();
  await page.getByRole('button',{name:'Pengaturan',exact:true}).click();for(const width of [1440,1100,900]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  expect(errors).toEqual([]);
});

test('settings tabs and save actions fit small windows without overlapping content',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Pengaturan',exact:true}).click();
  for(const [width,height] of [[1440,900],[1366,768],[900,700]]){
    await page.setViewportSize({width,height});
    for(const name of ['Koneksi API','Pengiriman','Percobaan ulang','Hasil & tampilan']){
      await page.getByRole('tab',{name,exact:true}).click();await expect(page.getByRole('tabpanel')).toHaveCount(1);
      const frame=await page.locator('#settings-fields').boundingBox(),actions=await page.locator('.settings-savebar').boundingBox(),save=await page.locator('#settings-save').boundingBox();
      expect(frame&&actions&&save).toBeTruthy();expect(frame!.y+frame!.height).toBeLessThanOrEqual(actions!.y+1);expect(save!.y+save!.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    }
  }
  await page.setViewportSize({width:1366,height:768});await page.getByRole('tab',{name:'Koneksi API',exact:true}).click();await page.screenshot({path:'artifacts/pengaturan-clean-api.png',animations:'disabled'});
  await page.getByRole('tab',{name:'Pengiriman',exact:true}).click();await page.screenshot({path:'artifacts/pengaturan-clean-pengiriman.png',animations:'disabled'});
  await page.getByRole('tab',{name:'Percobaan ulang',exact:true}).click();await page.screenshot({path:'artifacts/pengaturan-clean-retry.png',animations:'disabled'});
  await page.getByRole('tab',{name:'Hasil & tampilan',exact:true}).click();await page.screenshot({path:'artifacts/pengaturan-clean-output.png',animations:'disabled'});
  await page.getByRole('tab',{name:'Koneksi API',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Pengiriman',exact:true})).toHaveAttribute('aria-selected','true');
});
