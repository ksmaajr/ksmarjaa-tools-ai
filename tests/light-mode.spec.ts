import {test,expect} from '@playwright/test';

test('light mode keeps helper and readiness text readable across settings and Generate',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Pengaturan',exact:true}).click();
  await page.getByRole('tab',{name:'Hasil & tampilan',exact:true}).click();
  await page.locator('#setting-theme').selectOption('light');
  await page.getByRole('button',{name:'Simpan perubahan'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');

  const contrastOnWhite=(element:HTMLElement)=>{
    const [r,g,b]=getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const channel=(value:number)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
    const l=.2126*channel(r)+.7152*channel(g)+.0722*channel(b);return 1.05/(l+.05);
  };
  const settingContrast=await page.locator('.appearance-settings small').first().evaluate(element=>{
    const parse=(value:string)=>value.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const channel=(value:number)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
    const [r,g,b]=parse(getComputedStyle(element).color);const l=.2126*channel(r)+.7152*channel(g)+.0722*channel(b);return 1.05/(l+.05);
  });
  expect(settingContrast).toBeGreaterThan(4.5);

  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await expect(page.locator('#readiness-summary')).toBeVisible();
  await page.locator('#notifications').evaluate(element=>element.replaceChildren());
  const readinessContrast=await page.locator('#readiness-summary').evaluate(element=>{
    const [r,g,b]=getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const channel=(value:number)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
    const l=.2126*channel(r)+.7152*channel(g)+.0722*channel(b);return 1.05/(l+.05);
  });
  expect(readinessContrast).toBeGreaterThan(4.5);
  await expect(page.locator('#generate-view h1')).toHaveCSS('color','rgb(45, 41, 50)');
  const queueTextContrast=await page.locator('#job-list .queue-empty').evaluate(element=>{
    const [r,g,b]=getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const channel=(value:number)=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
    const l=.2126*channel(r)+.7152*channel(g)+.0722*channel(b);return 1.05/(l+.05);
  });
  expect(queueTextContrast).toBeGreaterThan(4.5);
  await page.setViewportSize({width:1366,height:768});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/generate-light-mode.png',animations:'disabled'});
  expect(errors).toEqual([]);
});
