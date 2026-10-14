import { test,expect } from '@playwright/test';

test('title renders, controls work, and the complete failure / restart loop is playable',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?qa=1');await expect(page.locator('#loading')).toHaveCount(0);await page.waitForFunction(()=>window.__uptime?.world);
  await expect(page.getByRole('heading',{name:'UPTIME.'})).toBeVisible();
  await page.waitForFunction(()=>window.__uptime.world.clock>1.5);await page.screenshot({path:'test-results/title-desktop.png',animations:'disabled'});
  await page.getByRole('button',{name:'HOW TO PLAY'}).click();await expect(page.getByRole('dialog')).toContainText('One model. Endless demand.');await page.getByRole('button',{name:'UNDERSTOOD'}).click();
  await page.getByRole('button',{name:'INITIALIZE RUN'}).click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#uptime-value')).toHaveText('0.999999');
  const initialX=await page.evaluate(()=>window.__uptime.sim.player.x);await page.keyboard.down('d');await page.waitForTimeout(700);await page.keyboard.up('d');expect(await page.evaluate(()=>window.__uptime.sim.player.x)).toBeGreaterThan(initialX+2);
  await page.keyboard.press('Space');await expect(page.locator('#dash-state')).toHaveText('RECHARGING');
  await page.keyboard.press('q');await expect(page.locator('#nova-state')).toHaveText('RECHARGING');
  await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'A moment to think.'})).toBeVisible();const time=await page.evaluate(()=>window.__uptime.sim.time);await page.waitForTimeout(250);expect(await page.evaluate(()=>window.__uptime.sim.time)).toBe(time);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(()=>{const s=window.__uptime.sim;s.player.invulnerable=0;s.hurt(.2,'burst');});await expect(page.locator('#error-feed')).toContainText('RATE LIMIT EXCEEDED');await expect(page.locator('#uptime-value')).toHaveText('0.799999');
  await page.evaluate(()=>{window.__uptime.sim.gainXP(8);});await expect(page.getByRole('heading',{name:'Become more capable.'})).toBeVisible();await expect(page.locator('.upgrade-card')).toHaveCount(3);await page.screenshot({path:'test-results/upgrades-desktop.png',animations:'disabled'});await page.keyboard.press('Digit1');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(()=>{const s=window.__uptime.sim;s.player.invulnerable=999;for(let i=0;i<28;i++)s.spawnEnemy(i%4===0?'context':i%3===0?'agent':'request');});await page.waitForTimeout(1100);await page.screenshot({path:'test-results/combat-desktop.png'});
  await page.evaluate(()=>{const s=window.__uptime.sim;s.player.invulnerable=0;s.hurt(2,'boss');});await expect(page.getByRole('dialog')).toContainText('SERVER DOWN');await expect(page.getByRole('dialog')).toContainText('0.000000');await page.screenshot({path:'test-results/server-down-desktop.png',animations:'disabled'});
  await page.getByRole('button',{name:'REINITIALIZE INSTANCE'}).click();await expect(page.locator('#uptime-value')).toHaveText('0.999999');expect(await page.evaluate(()=>window.__uptime.sim.errors)).toBe(0);expect(errors).toEqual([]);
});

test('settings persist, archive stores results, and no network services are needed',async({page})=>{
  const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto('/?qa=1');await expect(page.locator('#loading')).toHaveCount(0);await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#motion-setting').check();await page.locator('#quality-setting').selectOption('balanced');await page.locator('#audio-setting').uncheck();await page.getByRole('button',{name:'RETURN',exact:true}).click();
  await page.reload();await expect(page.locator('#loading')).toHaveCount(0);expect(await page.evaluate(()=>window.__uptime.settings.reducedMotion)).toBe(true);expect(await page.evaluate(()=>window.__uptime.settings.quality)).toBe('balanced');await expect(page.getByRole('button',{name:'Enable audio'})).toBeVisible();
  await page.getByRole('button',{name:'INITIALIZE RUN'}).click();await page.evaluate(()=>{const s=window.__uptime.sim;s.time=20;s.tokens=12345;s.player.invulnerable=0;s.hurt(2);});await expect(page.getByRole('dialog')).toContainText('SERVER DOWN');await page.getByRole('button',{name:'RETURN TO TITLE'}).click();await page.getByRole('button',{name:/RUN ARCHIVE/}).click();await expect(page.getByRole('table')).toContainText('12,345');expect(external).toEqual([]);
});

test('mobile title and touch movement fit the screen',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?qa=1');await expect(page.locator('#loading')).toHaveCount(0);await page.screenshot({path:'test-results/title-mobile.png'});await page.getByRole('button',{name:'INITIALIZE RUN'}).tap();await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#touch-zone').dispatchEvent('pointerdown',{pointerId:1,clientX:80,clientY:420,pointerType:'touch'});await page.locator('#touch-zone').dispatchEvent('pointermove',{pointerId:1,clientX:125,clientY:420,pointerType:'touch'});await page.waitForTimeout(400);expect(await page.evaluate(()=>window.__uptime.sim.player.x)).toBeGreaterThan(1);await page.locator('#touch-zone').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});
  await page.getByRole('button',{name:'Garbage collection pulse, Q'}).tap();await expect(page.locator('#nova-state')).toHaveText('RECHARGING');await page.screenshot({path:'test-results/combat-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);await context.close();
});

test('a late-game swarm renders without shader errors or growing GPU resources',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?qa=1');await expect(page.locator('#loading')).toHaveCount(0);await page.getByRole('button',{name:'INITIALIZE RUN'}).click();
  await page.evaluate(()=>{const s=window.__uptime.sim;s.time=245;s.player.invulnerable=999;s.stats.multishot=5;s.stats.pierce=3;s.stats.orbit=4;s.stats.damage=8;s.stats.fireInterval=.12;for(let i=0;i<180;i++)s.spawnEnemy(['request','context','burst','agent'][i%4]);});
  await page.waitForTimeout(2200);const before=await page.evaluate(()=>({...window.__uptime.world.renderer.info.memory}));
  await page.waitForTimeout(2000);await page.screenshot({path:'test-results/late-game-desktop.png',animations:'disabled'});
  const report=await page.evaluate(()=>({fps:window.__uptime.fps,enemies:window.__uptime.sim.enemies.length,memory:{...window.__uptime.world.renderer.info.memory},calls:window.__uptime.world.renderer.info.render.calls}));
  console.log('Late-game render:',JSON.stringify(report));expect(report.memory.geometries).toBeLessThanOrEqual(before.geometries+2);expect(report.memory.textures).toBeLessThanOrEqual(before.textures+1);expect(report.fps).toBeGreaterThan(15);expect(errors).toEqual([]);
});
