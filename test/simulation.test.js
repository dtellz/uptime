import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, MAX_UPTIME, ARENA_RADIUS, UPGRADES, ERRORS } from '../src/simulation.js';

const run = (sim, seconds, input={x:0,z:0}) => { for(let i=0;i<seconds*60;i++) sim.step(1/60,input); };
const fresh = () => { const s=new Simulation(123);s.reset();s.drainEvents();return s; };

test('every instance starts at six nines and reset clears the previous run',()=>{
  const s=fresh();assert.equal(s.player.uptime,0.999999);
  s.player.invulnerable=0;s.hurt(.5);s.spawnEnemy('boss');s.upgrades.damage=3;s.stats.damage=20;s.time=100;
  s.reset();assert.equal(s.player.uptime,MAX_UPTIME);assert.equal(s.time,0);assert.equal(s.errors,0);assert.equal(s.enemies.length,0);assert.equal(s.stats.damage,2);assert.deepEqual(s.upgrades,{});
});
test('diagonal input has the same speed as cardinal input and movement stays in the arena',()=>{
  const a=fresh(),b=fresh();run(a,1,{x:1,z:0});run(b,1,{x:1,z:1});assert.ok(Math.abs(Math.hypot(b.player.x,b.player.z)-a.player.x)<1e-6);
  run(a,30,{x:1,z:1});assert.ok(Math.hypot(a.player.x,a.player.z)<=ARENA_RADIUS-2+1e-6);
});
test('pausing and evolution freeze time, enemies, projectiles, and cooldowns',()=>{
  const s=fresh();run(s,2);s.dash();s.pause();const snapshot=JSON.stringify({p:s.player,e:s.enemies,b:s.bullets,time:s.time});run(s,10);assert.equal(JSON.stringify({p:s.player,e:s.enemies,b:s.bullets,time:s.time}),snapshot);
  s.resume();s.gainXP(s.xpNext);assert.equal(s.mode,'upgrade');const time=s.time;run(s,10);assert.equal(s.time,time);
});
test('damage emits accurate error categories, respects grace frames, and never yields negative uptime',()=>{
  const s=fresh();s.player.invulnerable=0;assert.equal(s.hurt(.2,'burst'),true);assert.equal(s.lastError.code,'429');assert.equal(s.errors,1);assert.equal(s.hurt(.2,'context'),false);
  s.player.invulnerable=0;s.hurt(3,'boss');assert.equal(s.player.uptime,0);assert.equal(s.mode,'dead');assert.equal(s.lastError.code,'OOM');assert.ok(s.drainEvents().some(e=>e.type==='death'));assert.equal(s.hurt(.1),false);
  assert.equal(ERRORS.request.title,'SERVICE UNAVAILABLE');
});
test('dash provides protection and cannot be spammed',()=>{
  const s=fresh();s.player.invulnerable=0;s.player.facingX=1;s.player.facingZ=0;assert.equal(s.dash(),true);assert.equal(s.dash(),false);assert.equal(s.hurt(.5),false);run(s,.2);assert.ok(s.player.x>3);assert.ok(s.player.dashCooldown>2);
  run(s,3);assert.equal(s.dash(),true);
});
test('pulse resolves nearby requests, clears nearby hostile tokens, and preserves distant requests',()=>{
  const s=fresh();const close=s.spawnEnemy('request',{x:3,z:0}),far=s.spawnEnemy('context',{x:30,z:0});s.hostiles.push({x:2,z:2},{x:30,z:30});assert.equal(s.nova(),true);assert.ok(close.hp<=0);assert.equal(far.hp,far.maxHp);assert.equal(s.hostiles.length,1);assert.equal(s.nova(),false);assert.equal(s.kills,1);
});
test('auto inference actually resolves incoming requests and drops collectible experience',()=>{
  const s=fresh();s.spawnEnemy('request',{x:6,z:0,speed:0});run(s,1);assert.ok(s.kills>=1);assert.ok(s.pickups.length>=1);assert.ok(s.tokens>=128);
  s.pickups[0].x=s.player.x;s.pickups[0].z=s.player.z;s.step(1/60);assert.ok(s.xp>=1);
});
test('level choices are unique, only offered choices apply, and every upgrade has an effect',()=>{
  for(const upgrade of UPGRADES){
    const s=fresh();s.player.uptime=.5;s.gainXP(s.xpNext);assert.equal(s.choices.length,3);assert.equal(new Set(s.choices.map(c=>c.id)).size,3);assert.equal(s.chooseUpgrade('unlisted'),false);
    s.choices=[upgrade];const previous=JSON.stringify([s.player.uptime,s.stats]);assert.equal(s.chooseUpgrade(upgrade.id),true);assert.notEqual(JSON.stringify([s.player.uptime,s.stats]),previous);assert.equal(s.upgrades[upgrade.id],1);assert.equal(s.mode,'running');
  }
});
test('multiple levels from a large pickup are offered in sequence without lost experience',()=>{
  const s=fresh();s.gainXP(35);assert.equal(s.level,2);assert.equal(s.mode,'upgrade');s.chooseUpgrade(s.choices[0].id);assert.equal(s.level,3);assert.equal(s.mode,'upgrade');s.chooseUpgrade(s.choices[0].id);assert.equal(s.level,3);assert.equal(s.mode,'running');assert.equal(s.xp,15);
});
test('repairs and regeneration never exceed six nines',()=>{
  const s=fresh();s.stats.regen=1;run(s,2);assert.equal(s.player.uptime,MAX_UPTIME);s.gainXP(s.xpNext);s.choices=[UPGRADES.find(u=>u.id==='heal')];s.chooseUpgrade('heal');assert.equal(s.player.uptime,MAX_UPTIME);
});
test('the final surge is required for victory, then endless mode restores service',()=>{
  const s=fresh();s.time=259.99;s.player.invulnerable=999;s.step(1/60);assert.ok(s.boss);assert.equal(s.bossSpawned,true);s.time=300;s.step(1/60);assert.equal(s.mode,'running');s.hitEnemy(s.boss,1e6);s.step(1/60);assert.equal(s.mode,'victory');s.player.uptime=.1;s.continueEndless();assert.equal(s.mode,'running');assert.equal(s.endless,true);assert.equal(s.player.uptime,MAX_UPTIME);s.step(1/60);assert.equal(s.mode,'running');
});
test('large swarms remain bounded across extended runs',()=>{
  const s=fresh();s.time=1000;s.player.invulnerable=1e6;
  for(let i=0;i<1000;i++)s.spawnEnemy('request');assert.equal(s.enemies.length,220);
  for(let i=0;i<60*60;i++){if(s.mode==='upgrade')s.chooseUpgrade(s.choices[0].id);s.step(1/60,{x:Math.cos(i/140),z:Math.sin(i/140)});}
  assert.ok(s.enemies.length<=220);assert.ok(s.bullets.length<=250);assert.ok(s.pickups.length<=400);assert.ok(s.hostiles.length<=160);
});
