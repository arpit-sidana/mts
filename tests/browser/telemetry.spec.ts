import { test, expect } from '@playwright/test';
import { mockTelemetry } from './fixtures';

test('received aircraft, vessels, and alerts have technical drill-downs and real source clocks',async({page})=>{
  await mockTelemetry(page);await page.goto('/');
  await expect(page.locator('.map-ready')).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(page.locator('.telemetry-panel')).toContainText('1 aircraft positioned');
  await expect(page.locator('.telemetry-panel')).toContainText('1 vessels observed');
  await page.locator('.feed-row').first().click();
  await expect(page.getByRole('dialog')).toContainText('MTS123');
  await page.getByRole('button',{name:/MTS123 United States/}).click();
  const detail=page.getByRole('complementary',{name:'Observation details'});
  await expect(detail).toContainText('32,808 ft');await expect(detail).toContainText('447 kt');await expect(detail).toContainText('ABC123');
  await expect(detail).toContainText('not extrapolated');await expect(detail.getByRole('link',{name:'The OpenSky Network'})).toHaveAttribute('href','https://opensky-network.org/');
  await page.getByRole('button',{name:'Close details'}).click();await page.locator('.feed-row').nth(1).click();
  await page.getByRole('button',{name:/MTS TEST SHIP/}).click();await expect(detail).toContainText('HELSINKI');await expect(detail).toContainText('Tanker');
  await page.getByRole('button',{name:'Close details'}).click();await page.locator('.feed-row').nth(2).click();
  await page.getByRole('button',{name:/Severe Thunderstorm Warning/}).click();await expect(detail).toContainText('Test-only instruction');
});
test('the UTC display advances without any time configuration',async({page})=>{
  await mockTelemetry(page);await page.goto('/');await expect(page.locator('.map-ready')).toHaveAttribute('data-ready','true',{timeout:30000});
  const time=page.locator('.telemetry-heading time'),before=await time.innerText();
  await expect.poll(()=>time.innerText(),{timeout:3000}).not.toEqual(before);
  await expect(page.locator('.solar-controls')).toHaveCount(0);await expect(page.getByRole('slider')).toHaveCount(0);
});
test('provider outages never restore synthetic traffic or invent zero-count global totals',async({page})=>{
  await mockTelemetry(page,true);await page.goto('/');
  await expect(page.locator('.telemetry-panel')).toContainText(/unavailable/i);
  await expect(page.locator('.telemetry-panel')).toContainText('Provider returned HTTP 503');
  await expect(page.locator('.telemetry-panel')).toContainText('— aircraft positioned');
  await expect(page.locator('.telemetry-panel')).not.toContainText('0 aircraft positioned');
  await expect(page.getByRole('switch',{name:'Illustrative flight movement'})).toHaveCount(0);
});
test('mobile live status and observation index remain usable',async({page})=>{
  await mockTelemetry(page);await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('.telemetry-panel')).toContainText('1 aircraft positioned');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.locator('.feed-row').first().click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox',{name:'Search live observations'}).fill('MTS123');await expect(page.locator('.observation-list button')).toHaveCount(1);
});
