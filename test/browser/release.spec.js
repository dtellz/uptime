import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('production release runs under a GitHub Pages repository path without backend or development code',async({page})=>{
  const origin='https://uptime-release.test';
  const prefix='/im-ai/';
  const errors=[],requests=[];
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.txt':'text/plain'};
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  // Serve the exact dist files through browser routing, at a project-site URL.
  // This deliberately supplies no application server, APIs, or Vite transforms.
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin!==origin||!url.pathname.startsWith(prefix)){errors.push(`Unexpected request: ${url.href}`);await route.abort();return;}
    const file=url.pathname===prefix?'index.html':decodeURIComponent(url.pathname.slice(prefix.length));
    try{const body=await readFile(path.resolve('dist',file));await route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body});}
    catch{errors.push(`Missing release asset: ${file}`);await route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto(`${origin}${prefix}?qa=1`);
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'UPTIME.'})).toBeVisible();
  expect(await page.evaluate(()=>typeof window.__uptime)).toBe('undefined');
  await page.getByRole('button',{name:'INITIALIZE RUN'}).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#uptime-value')).toHaveText('0.999999');
  await page.keyboard.press('q');await expect(page.locator('#nova-state')).toHaveText('RECHARGING');
  await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'A moment to think.'})).toBeVisible();
  expect(requests.some(r=>r.endsWith('.woff2'))).toBe(true);
  expect(errors).toEqual([]);
});
