import { test, expect } from '@playwright/test';

test('the actual WebGL globe loads without runtime errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.map-ready')).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(page.locator('.map-error')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'The world, in motion.'})).toBeVisible();
  const before=Number(await page.locator('[data-zoom]').getAttribute('data-zoom'));
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect.poll(async()=>Number(await page.locator('[data-zoom]').getAttribute('data-zoom'))).toBeGreaterThan(before+0.8);
  await page.getByRole('button',{name:'Return to global view',exact:true}).click();
  await expect.poll(async()=>Math.abs(Number(await page.locator('[data-zoom]').getAttribute('data-zoom'))-before)).toBeLessThan(0.1);
  const canvas=page.locator('.maplibregl-canvas');const bounds=await canvas.boundingBox();
  await canvas.click({position:{x:bounds!.width/2,y:bounds!.height/2}});
  await expect(page.getByRole('complementary',{name:'Location details'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('a briefing signal opens evidence, related signals, and detailed geographic zoom',async({page})=>{
  await page.goto('/');await expect(page.locator('.map-ready')).toHaveAttribute('data-ready','true',{timeout:30000});
  await page.locator('.briefing-card').first().click();
  const panel=page.getByRole('complementary',{name:'Signal details'});
  await expect(panel.getByRole('heading',{name:'A chokepoint under pressure'})).toBeVisible();
  await expect(panel.getByRole('link',{name:'U.S. EIA'})).toHaveAttribute('href',/oct26.pdf/);
  await expect(panel).toContainText('4.8M b/d');
  await panel.getByRole('button',{name:'Dive deeper'}).click();
  await expect.poll(async()=>Number(await page.locator('[data-zoom]').getAttribute('data-zoom'))).toBeGreaterThan(6.3);
  await panel.getByRole('button',{name:'Singapore',exact:true}).click();
  await expect(panel).toContainText('44.66M TEU');
  await page.getByRole('button',{name:'Close details'}).click();await expect(panel).toHaveCount(0);
});
test('layers, solar time, pause, source filtering, export, and index search work',async({page})=>{
  await page.goto('/');await expect(page.locator('.map-ready')).toHaveAttribute('data-ready','true',{timeout:30000});
  const weather=page.getByRole('button',{name:/Weather impacts/});await weather.click();await expect(weather).toHaveAttribute('aria-pressed','true');
  await page.getByRole('switch',{name:'Day and night overlay'}).click();
  await page.getByRole('slider',{name:'Snapshot UTC hour'}).fill('8');await expect(page.locator('.solar-controls')).toContainText('08:00 UTC');
  await page.getByRole('switch',{name:'Illustrative flight movement'}).click();await expect(page.getByRole('switch',{name:'Illustrative flight movement'})).toHaveAttribute('aria-checked','true');
  await page.getByRole('button',{name:'Pause animations',exact:true}).click();await expect(page.getByRole('button',{name:'Play animations',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sources',exact:true}).click();
  await page.getByRole('combobox',{name:'Filter sources by activity'}).selectOption('weather');await expect(page.locator('.source-list article')).toHaveCount(1);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export visible snapshot'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('mts-snapshot-2026-10-14.json');
  await page.getByRole('button',{name:'Close dialog'}).click();await page.getByRole('button',{name:'Search signals or places'}).click();
  await page.getByRole('textbox',{name:'Search signals and places'}).fill('cobalt');await expect(page.locator('.search-results button')).toHaveCount(1);await page.locator('.search-results button').click();await expect(page.locator('.detail-panel')).toContainText('DR Congo');
});
test('mobile layout keeps primary controls visible and opens a readable detail sheet',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('.map-ready')).toHaveAttribute('data-ready','true',{timeout:30000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  const dock=await page.locator('.layer-dock').boundingBox(),bottom=await page.locator('.bottom-zone').boundingBox();
  expect(dock!.y+dock!.height).toBeLessThan(bottom!.y);
  await page.locator('.briefing-card').first().click();await expect(page.locator('.detail-panel')).toBeVisible();await expect(page.locator('.layer-dock')).toBeHidden();
  const panel=await page.locator('.detail-panel').boundingBox();expect(panel!.x).toBeGreaterThanOrEqual(0);expect(panel!.x+panel!.width).toBeLessThanOrEqual(390);
});
