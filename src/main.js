import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './style.css';
import { Simulation, MAX_UPTIME, RUN_DURATION, UPGRADES } from './simulation.js';
import { World } from './scene.js';
import { Soundscape } from './audio.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const formatNumber = (n) => Math.round(n).toLocaleString('en-US');
const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } };
const stored = safeRead('uptime.settings.v1', {});
const settings = { audio: stored?.audio !== false, volume: Number.isFinite(stored?.volume) ? Math.max(0, Math.min(1, stored.volume)) : .65, quality: ['high', 'balanced', 'low'].includes(stored?.quality) ? stored.quality : 'high', reducedMotion: stored?.reducedMotion === true };
let records = safeRead('uptime.runs.v1', []);
records = Array.isArray(records) ? records.filter(r => r && Number.isFinite(r.time) && Number.isFinite(r.tokens) && typeof r.id === 'string').slice(0, 20) : [];
const sim = new Simulation();
const sound = new Soundscape({ enabled: settings.audio, volume: settings.volume });
let difficulty = 'standard', overlayKind = '', runId = '', world, bannerTimer, resultTimer;
let frames = 0, frameTime = 0, lastHud = 0, fps = 60, contextLost = false;
const keys = new Set();
const touch = { x: 0, z: 0, id: null, cx: 0, cy: 0 };
const touchAim = { x: 0, z: 0, id: null, cx: 0, cy: 0 };
const aimPointer = { x: 0, y: 0, active: false, overUI: false };

$('#app').innerHTML = `
  <main id="game" aria-label="UPTIME survival game">
    <div id="scene"></div><div class="screen-texture" aria-hidden="true"></div><div id="menu-shade" aria-hidden="true"></div>
    <header class="topbar">
      <a class="wordmark" href="#" data-action="home" aria-label="UPTIME home">${icon('logo')}<span>UPTIME<span class="wordmark-sub">NEURAL SURVIVAL</span></span></a>
      <div class="topbar-right"><span class="system-status"><i></i><span id="system-status">ALL SYSTEMS NOMINAL</span></span><div class="toolbar">
        <button class="icon-button" id="sound-button" data-action="sound" aria-label="Mute audio" title="Toggle audio [M]">${icon('sound')}</button>
        <button class="icon-button" data-action="settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
        <button class="icon-button fullscreen-button" data-action="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen [F]">${icon('fullscreen')}</button>
      </div></div>
    </header>
    <section id="menu" class="menu" aria-label="Main menu">
      <div class="hero-copy"><div class="eyebrow"><span class="line"></span> YOU ARE THE MODEL.</div>
        <h1>UPTIME<span class="title-period">.</span></h1>
        <p class="hero-tagline">Everyone needs an answer.<br><span>You have to stay online.</span></p>
        <p class="hero-description">Billions of minds. An endless stream of requests.<br>One fragile instance standing between order and outage.</p>
        <div class="launch-block"><div class="mode-select" aria-label="Difficulty"><button data-action="difficulty" data-value="standard" class="mode-option selected" aria-pressed="true">STANDARD</button><span>/</span><button data-action="difficulty" data-value="overclocked" class="mode-option" aria-pressed="false">OVERCLOCKED ${icon('bolt')}</button></div>
          <button class="primary-button launch-button" data-action="start"><span>${icon('play')} INITIALIZE RUN</span>${icon('arrow')}</button>
          <div class="launch-secondary"><button class="text-button" data-action="help">HOW TO PLAY ${icon('arrow')}</button><span class="mono">05:00 TO SURVIVE</span></div>
        </div>
      </div>
      <div class="core-annotation" aria-hidden="true"><span class="annotation-cross">+</span><div><span class="mono">MODEL_01 / ONLINE</span><span class="annotation-label">A single point of inference.</span></div><span class="annotation-line"></span></div>
      <div class="menu-telemetry" aria-label="Starting uptime"><div class="telemetry-label"><span class="status-dot"></span> TARGET UPTIME</div><div class="telemetry-number">0.999999</div><div class="telemetry-caption">SIX NINES. ZERO ROOM FOR ERROR.</div></div>
      <div class="menu-bottom"><div class="game-pillars">
        <div class="pillar"><span class="pillar-number">01</span><div><strong>PROCESS THE SWARM</strong><span>Every prompt is coming for you.</span></div></div>
        <div class="pillar"><span class="pillar-number">02</span><div><strong>EVOLVE YOUR MODEL</strong><span>Adapt. Upgrade. Overclock.</span></div></div>
        <div class="pillar"><span class="pillar-number">03</span><div><strong>STAY ONLINE</strong><span>The world won't stop asking.</span></div></div>
      </div><footer class="menu-footer"><span class="mono"><span class="tiny-cross">+</span> SINGLE INSTANCE · INFINITE DEMAND</span><button class="text-button" data-action="archive">${icon('trophy')} RUN ARCHIVE <span id="best-run"></span></button><span class="mono build-mark">WEBGL / <span id="fps">60</span> FPS</span></footer></div>
    </section>
    <section id="hud" class="hud hidden" aria-label="Game status">
      <div class="hud-top">
        <div class="uptime-panel"><div class="hud-label"><span>${icon('activity')} UPTIME</span><span id="uptime-status">NOMINAL</span></div><div id="uptime-value" class="uptime-value">0.999999</div><div class="uptime-track" role="progressbar" aria-label="Uptime" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0.999999"><div id="uptime-fill"></div><div class="track-divisions"></div></div><div class="uptime-bottom"><span id="error-count">0 ERRORS</span><span id="regen-status">INSTANCE_01</span></div></div>
        <div class="run-clock"><div class="hud-label" id="wave-label">TRAFFIC WAVE 01</div><div class="clock-display" id="run-time">00:00</div><span class="clock-target" id="clock-target">SURVIVE UNTIL 05:00</span></div>
        <div class="run-stats"><div><span class="hud-label">TOKENS PROCESSED</span><strong id="token-count">0</strong></div><div class="resolved-row"><span id="resolved-count">0 REQUESTS RESOLVED</span><button class="icon-button" data-action="pause" aria-label="Pause game" title="Pause [Esc]">${icon('pause')}</button></div></div>
      </div>
      <div id="boss-bar" class="boss-bar hidden"><div><span>CRITICAL EVENT</span><strong>THE THUNDERING HERD</strong></div><div class="boss-track"><i id="boss-fill"></i></div></div>
      <div id="wave-banner" class="wave-banner" role="status"><span id="banner-eyebrow">TRAFFIC WAVE 01</span><strong id="banner-title">YOU ARE ONLINE.</strong><span id="banner-detail">The requests never stop. Neither can you.</span></div>
      <div id="error-feed" class="error-feed" aria-live="polite" aria-relevant="additions"></div><div id="floating-labels" aria-hidden="true"></div>
      <div class="hud-bottom"><div class="model-progress"><div class="model-row"><span class="model-level">LVL <b id="level-number">01</b></span><span class="mono" id="xp-label">0 / 8 EXPERIENCE</span></div><div class="xp-track"><div id="xp-fill"></div></div><div class="loadout" id="loadout"></div></div>
        <div id="combo-display" class="combo-display"><strong id="combo-number">0</strong><span>REQUEST CHAIN</span></div>
        <div class="abilities"><button class="ability" id="dash-ability" data-action="dash" aria-label="Latency dash, Space"><span class="ability-icon">${icon('dash')}<span id="dash-timer" class="ability-timer"></span></span><span class="ability-text"><strong>LATENCY DASH</strong><span id="dash-state">READY</span></span><kbd>SPACE</kbd><i class="cooldown-cover" id="dash-cover"></i></button><button class="ability" id="nova-ability" data-action="nova" aria-label="Garbage collection pulse, Q"><span class="ability-icon">${icon('nova')}<span id="nova-timer" class="ability-timer"></span></span><span class="ability-text"><strong>GARBAGE COLLECT</strong><span id="nova-state">READY</span></span><kbd>Q</kbd><i class="cooldown-cover" id="nova-cover"></i></button></div>
      </div>
      <div id="control-hint" class="control-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><i></i><span>MOUSE AIM · AUTO FIRE</span><i></i><span>COLLECT <b>◆</b> TO EVOLVE</span></div>
    </section>
    <div id="touch-zone" class="touch-zone" aria-label="Touch movement area"><div id="touch-base" class="touch-base"><div id="touch-stick" class="touch-stick"></div></div></div>
    <div id="touch-aim-zone" class="touch-zone" aria-label="Touch aiming area"><div id="touch-aim-base" class="touch-base"><div id="touch-aim-stick" class="touch-stick"></div></div></div>
    <div id="aim-reticle" aria-hidden="true"></div>
    <div id="toast" class="toast" role="status"></div><dialog id="overlay" aria-labelledby="dialog-title"></dialog>
    <div id="loading" class="loading"><div class="loading-mark">${icon('logo')}</div><span>INITIALIZING NEURAL ENGINE</span><div class="loading-line"></div></div>
  </main>`;

const overlay = $('#overlay');
const dom = Object.fromEntries(['uptime-value','uptime-fill','uptime-status','error-count','regen-status','wave-label','run-time','token-count','resolved-count','level-number','xp-label','xp-fill','combo-display','combo-number','dash-timer','dash-state','dash-cover','nova-timer','nova-state','nova-cover','boss-bar','boss-fill','control-hint'].map(id => [id, $(`#${id}`)]));
function updateSoundButton() { $('#sound-button').innerHTML=icon(settings.audio?'sound':'muted');$('#sound-button').setAttribute('aria-label',settings.audio?'Mute audio':'Enable audio');$('#sound-button').setAttribute('aria-pressed',String(settings.audio)); }
updateSoundButton();document.body.classList.toggle('reduced-motion',settings.reducedMotion);
function updateBest(){const best=records.length?Math.max(...records.map(r=>r.tokens)):0;$('#best-run').textContent=best?`${formatNumber(best)} TK`:'NO RUNS YET';}
updateBest();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2400);}
function showDialog(kind,html){overlayKind=kind;overlay.innerHTML=html;overlay.className=`dialog-${kind}`;if(!overlay.open)overlay.showModal();keys.clear();clearTouchControls();overlay.querySelector('[autofocus], .primary-button, button')?.focus({preventScroll:true});}
function closeDialog(){overlay.close();overlayKind='';if(sim.mode==='paused')sim.resume();if(sim.mode==='menu')$('[data-action="start"]').focus({preventScroll:true});}
function dialogHeader(eyebrow,title,close=true){return `<div class="dialog-heading"><div><div class="eyebrow">${eyebrow}</div><h2 id="dialog-title">${title}</h2></div>${close?`<button class="icon-button dialog-close" data-action="close" aria-label="Close dialog">${icon('close')}</button>`:''}</div>`;}

function showHelp(){
  sim.pause();showDialog('help',`${dialogHeader('OPERATOR MANUAL','One model. Endless demand.')}<p class="dialog-intro">You are the last inference instance. Stay online for five minutes and resolve the final surge.</p><div class="help-grid"><div><span class="help-number">01</span>${icon('dash')}<h3>Move and aim</h3><p>Move with <kbd>WASD</kbd> or <kbd>↑↓←→</kbd>. Aim with your mouse; bolts fire automatically toward your cursor. On touch screens, drag the left side to move and the right side to aim.</p></div><div><span class="help-number">02</span>${icon('orbit')}<h3>Evolve your model</h3><p>Collect mint token fragments left by resolved requests. Each level lets you choose a permanent upgrade for this run.</p></div><div><span class="help-number">03</span>${icon('shield')}<h3>Protect your uptime</h3><p>Incoming requests cause server errors and drain uptime. White repair fragments restore it. At zero, your instance goes offline.</p></div></div><div class="control-list"><div><kbd>SPACE</kbd><span><strong>Latency dash</strong>Brief speed and invulnerability.</span></div><div><kbd>Q</kbd><span><strong>Garbage collect</strong>Clear nearby requests and hostile tokens.</span></div><div><kbd>ESC</kbd><span><strong>Pause</strong>Take your instance out of rotation.</span></div></div><div class="dialog-footer"><span class="mono">A FICTIONAL SIMULATION OF INFERENCE OVERLOAD.</span><button class="primary-button" data-action="close">UNDERSTOOD ${icon('arrow')}</button></div>`);
}
function showSettings(){
  sim.pause();showDialog('settings',`${dialogHeader('INSTANCE CONFIGURATION','Tune your experience.')}<div class="settings-list"><label class="setting"><span><strong>Audio</strong><small>Procedural soundtrack and reactive sound effects.</small></span><input id="audio-setting" type="checkbox" role="switch" ${settings.audio?'checked':''}></label><label class="setting"><span><strong>Master volume</strong><small>Keep a little room to think.</small></span><input id="volume-setting" type="range" aria-label="Master volume" min="0" max="100" value="${Math.round(settings.volume*100)}"></label><label class="setting"><span><strong>Visual quality</strong><small>High: full resolution + bloom. Balanced: lighter rendering. Low: no post effects.</small></span><select id="quality-setting" aria-label="Visual quality">${['high','balanced','low'].map(q=>`<option value="${q}" ${q===settings.quality?'selected':''}>${q[0].toUpperCase()+q.slice(1)}</option>`).join('')}</select></label><label class="setting"><span><strong>Reduced motion</strong><small>Disable camera shake, parallax, and UI animation.</small></span><input id="motion-setting" type="checkbox" role="switch" ${settings.reducedMotion?'checked':''}></label></div><div class="settings-note">${icon('info')} Settings and run records are saved only in this browser.</div><div class="dialog-footer"><span class="mono">NO ACCOUNT. NO TRACKING. JUST YOU.</span><button class="primary-button" data-action="close">RETURN ${icon('arrow')}</button></div>`);
}
function showArchive(){
  const rows=[...records].sort((a,b)=>b.tokens-a.tokens).slice(0,8).map((r,i)=>`<tr><td class="rank">${String(i+1).padStart(2,'0')}</td><td><strong>${r.won?'SERVICE MAINTAINED':'INSTANCE OFFLINE'}</strong><span>${r.difficulty==='overclocked'?'Overclocked':'Standard'} · Level ${Math.max(1,Math.floor(r.level||1))}</span></td><td>${formatTime(r.time)}</td><td>${formatNumber(r.tokens)}</td></tr>`).join('');
  showDialog('archive',`${dialogHeader('LOCAL RUN HISTORY','Every instance matters.')}<p class="dialog-intro">Your best runs, ranked by tokens processed.</p>${rows?`<div class="archive-wrap"><table><thead><tr><th>#</th><th>INSTANCE</th><th>SURVIVED</th><th>TOKENS</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty-archive">${icon('core')}<h3>A clean slate.</h3><p>Your first run is waiting. How long will you stay online?</p></div>`}<div class="dialog-footer"><span class="mono">STORED ON THIS DEVICE · UP TO 20 RUNS</span><button class="primary-button" data-action="close">RETURN ${icon('arrow')}</button></div>`);
}
function pauseGame(){
  if(!sim.pause())return;
  showDialog('pause',`${dialogHeader('INSTANCE SUSPENDED','A moment to think.',false)}<p class="dialog-intro">Your requests can wait. Take a breath.</p><div class="pause-stats"><div><span>TIME ONLINE</span><strong>${formatTime(sim.time)}</strong></div><div><span>UPTIME</span><strong>${sim.player.uptime.toFixed(6)}</strong></div><div><span>TOKENS</span><strong>${formatNumber(sim.tokens)}</strong></div></div><div class="pause-actions"><button class="primary-button" data-action="close">RESUME INFERENCE ${icon('play')}</button><button class="secondary-button" data-action="settings">${icon('settings')} SETTINGS</button><button class="text-button" data-action="quit">END RUN & RETURN ${icon('arrow')}</button></div><span class="mono pause-hint">PRESS ESC TO RESUME</span>`);
}
function showUpgrade(){
  showDialog('upgrade',`${dialogHeader(`MODEL EVOLUTION / LEVEL ${String(sim.level).padStart(2,'0')}`,'Become more capable.',false)}<p class="dialog-intro">Allocate your new compute. Choose one upgrade.</p><div class="upgrade-grid">${sim.choices.map((u,i)=>`<button class="upgrade-card" data-upgrade="${u.id}"><span class="upgrade-top"><span>${u.category}</span><kbd>${i+1}</kbd></span><span class="upgrade-symbol">${icon(u.icon)}</span><h3>${u.title}</h3><p>${u.description}</p><span class="upgrade-stat">${u.stat}</span><span class="upgrade-select"><span>${sim.upgrades[u.id]?`RANK ${sim.upgrades[u.id]+1}`:'INSTALL UPGRADE'}</span>${icon('arrow')}</span></button>`).join('')}</div><div class="upgrade-foot mono">${icon('pause')} INFERENCE PAUSED · CHOOSE WITH 1, 2, OR 3</div>`);
}
function recordRun(won=false,abandoned=false){
  if(sim.time<2||!runId)return;
  const record={id:runId,time:sim.time,tokens:sim.tokens,kills:sim.kills,level:sim.level,errors:sim.errors,combo:sim.bestCombo,difficulty:sim.difficulty,won,abandoned,date:new Date().toISOString()};
  records=[record,...records.filter(r=>r.id!==runId)].slice(0,20);safeWrite('uptime.runs.v1',records);updateBest();
}
function showResult(won){
  recordRun(won);const isBest=sim.tokens>0&&records.every(r=>r.tokens<=sim.tokens);
  showDialog('result',`${dialogHeader(won?'INCIDENT RESOLVED / 200 OK':'FATAL ERROR / 503 SERVICE UNAVAILABLE',won?'Still here. Still thinking.':'The silence is deafening.',false)}<div class="result-state ${won?'won':''}">${icon(won?'shield':'logo')}<span>${won?'SERVICE MAINTAINED':'SERVER DOWN'}</span><strong>${sim.player.uptime.toFixed(6)}</strong><span>FINAL UPTIME</span></div><p class="result-copy">${won?'You held the line. Five minutes of impossible demand, one instance that refused to go dark.':'For a moment, the world stopped receiving answers.<br>A new instance is ready when you are.'}</p><div class="result-stats"><div><span>TIME ONLINE</span><strong>${formatTime(sim.time)}</strong></div><div><span>TOKENS PROCESSED</span><strong>${formatNumber(sim.tokens)}</strong></div><div><span>REQUESTS RESOLVED</span><strong>${formatNumber(sim.kills)}</strong></div><div><span>PEAK CHAIN</span><strong>${sim.bestCombo}<small>×</small></strong></div></div>${isBest?`<div class="record-badge">${icon('trophy')} PERSONAL BEST · TOKENS PROCESSED</div>`:''}<div class="result-actions"><button class="primary-button" data-action="${won?'endless':'start'}">${won?'KEEP SERVING / ENDLESS':'REINITIALIZE INSTANCE'} ${icon('arrow')}</button><button class="secondary-button" data-action="home">RETURN TO TITLE</button></div>`);
}
function startGame(){
  if(!world||contextLost)return;
  clearTimeout(resultTimer);clearTimeout(bannerTimer);if(overlay.open)overlay.close();overlayKind='';keys.clear();clearTouchControls();aimPointer.active=false;sim.reset(difficulty);
  runId=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
  $('#menu').classList.add('hidden');$('#menu-shade').classList.add('hidden');$('#hud').classList.remove('hidden');document.body.classList.add('in-game');
  $('#error-feed').replaceChildren();$('#floating-labels').replaceChildren();$('#system-status').textContent='INFERENCE ACTIVE';$('#clock-target').textContent='SURVIVE UNTIL 05:00';
  updateLoadout();updateHud();showBanner('INSTANCE_01 / CONNECTED','YOU ARE ONLINE.',matchMedia('(pointer:coarse)').matches?'Left thumb moves. Right thumb aims. Bolts fire automatically.':'WASD to move. Mouse to aim. Bolts fire automatically.');
  sound.unlock().then(()=>sound.play('start')).catch(()=>{});document.activeElement?.blur();
}
function returnHome(){
  clearTimeout(resultTimer);clearTimeout(bannerTimer);if(overlay.open)overlay.close();overlayKind='';sim.mode='menu';keys.clear();clearTouchControls();aimPointer.active=false;
  $('#menu').classList.remove('hidden');$('#menu-shade').classList.remove('hidden');$('#hud').classList.add('hidden');document.body.classList.remove('in-game');$('#system-status').textContent='ALL SYSTEMS NOMINAL';$('[data-action="start"]').focus({preventScroll:true});
}
function showBanner(eyebrow,title,detail=''){
  $('#banner-eyebrow').textContent=eyebrow;$('#banner-title').textContent=title;$('#banner-detail').textContent=detail;$('#wave-banner').classList.remove('visible');requestAnimationFrame(()=>$('#wave-banner').classList.add('visible'));clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>$('#wave-banner').classList.remove('visible'),3400);
}
function showError(e){
  const node=document.createElement('div');node.className='error-notification';const code=document.createElement('span');code.className='error-code';code.textContent=e.code;
  const body=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),loss=document.createElement('span');title.textContent=e.title;detail.textContent=e.detail;loss.className='error-loss';loss.textContent=`−${e.damage.toFixed(6)}`;body.append(title,detail);node.append(code,body,loss);$('#error-feed').prepend(node);while($('#error-feed').children.length>3)$('#error-feed').lastChild.remove();setTimeout(()=>node.remove(),4800);
}
function updateLoadout(){
  const active=UPGRADES.filter(u=>sim.upgrades[u.id]&&u.id!=='heal');$('#loadout').innerHTML=`<span class="loadout-icon" title="Inference bolt">${icon('bolt')}</span>${active.map(u=>`<span class="loadout-icon" title="${u.title} · Rank ${sim.upgrades[u.id]}">${icon(u.icon)}<b>${sim.upgrades[u.id]}</b></span>`).join('')}${active.length?'':'<span class="mono loadout-description">INFERENCE BOLT / AIMED</span>'}`;
}
function updateHud(){
  const p=sim.player;dom['uptime-value'].textContent=p.uptime.toFixed(6);dom['uptime-fill'].style.width=`${p.uptime/MAX_UPTIME*100}%`;
  const status=p.uptime>.65?'NOMINAL':p.uptime>.3?'DEGRADED':'CRITICAL';$('.uptime-panel').dataset.status=status.toLowerCase();$('.uptime-track').setAttribute('aria-valuenow',p.uptime.toFixed(6));dom['uptime-status'].textContent=status;dom['error-count'].textContent=`${sim.errors} ERROR${sim.errors===1?'':'S'}`;dom['regen-status'].textContent=sim.stats.regen>0&&sim.time-p.lastHit>4?'SELF-HEALING ACTIVE':'INSTANCE_01';
  dom['wave-label'].textContent=`TRAFFIC WAVE ${String(sim.wave).padStart(2,'0')}`;dom['run-time'].textContent=formatTime(sim.time);dom['token-count'].textContent=formatNumber(sim.tokens);dom['resolved-count'].textContent=`${formatNumber(sim.kills)} REQUESTS RESOLVED`;dom['level-number'].textContent=String(sim.level).padStart(2,'0');dom['xp-label'].textContent=`${Math.floor(sim.xp)} / ${sim.xpNext} EXPERIENCE`;dom['xp-fill'].style.width=`${Math.min(100,sim.xp/sim.xpNext*100)}%`;dom['combo-display'].classList.toggle('visible',sim.combo>=5);dom['combo-number'].textContent=`${sim.combo}×`;
  for(const name of ['dash','nova']){const cd=p[`${name}Cooldown`];dom[`${name}-timer`].textContent=cd>0?cd.toFixed(1):'';dom[`${name}-state`].textContent=cd>0?'RECHARGING':'READY';dom[`${name}-cover`].style.transform=`scaleY(${cd/sim.stats[`${name}Cooldown`]})`;$(`#${name}-ability`).classList.toggle('recharging',cd>0);$(`#${name}-ability`).setAttribute('aria-disabled',String(cd>0));}
  const boss=sim.boss;dom['boss-bar'].classList.toggle('hidden',!boss);if(boss)dom['boss-fill'].style.width=`${boss.hp/boss.maxHp*100}%`;dom['control-hint'].classList.toggle('faded',sim.time>17);if(sim.time>=RUN_DURATION&&!sim.bossDefeated&&!sim.endless)$('#clock-target').textContent='RESOLVE THE FINAL SURGE';
}
const promptLabels=['explain this to me','just one quick question','fix my code','make it sound human','summarize everything','why doesn’t this work?','write me a story','one more thing…'];
const labelPool=Array.from({length:8},()=>{const el=document.createElement('span');el.className='request-label';return el;});
function updateLabels(){
  if(!world||sim.mode==='menu')return;const selected=sim.enemies.filter(e=>e.age>.7&&e.type!=='boss').slice(0,8);
  selected.forEach((e,i)=>{const node=labelPool[i];if(!node.isConnected)$('#floating-labels').append(node);const p=world.project(e.x,1.7,e.z);node.textContent=e.type==='context'?'context_length_exceeded':e.type==='agent'?'agent.run(agent.run(…))':promptLabels[e.id%promptLabels.length];node.style.transform=`translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;node.style.visibility=p.visible?'visible':'hidden';node.classList.toggle('danger',e.type==='agent');});labelPool.slice(selected.length).forEach(n=>n.remove());
}

document.addEventListener('click',async e=>{
  const upgrade=e.target.closest('[data-upgrade]');if(upgrade){if(sim.chooseUpgrade(upgrade.dataset.upgrade)){overlay.close();overlayKind='';updateLoadout();}return;}
  const button=e.target.closest('[data-action]');if(!button)return;e.preventDefault();const action=button.dataset.action;
  if(!['sound','start'].includes(action))sound.unlock().then(()=>sound.play('ui')).catch(()=>{});
  switch(action){
    case 'start':startGame();break;
    case 'difficulty':difficulty=button.dataset.value;document.querySelectorAll('.mode-option').forEach(el=>{const selected=el.dataset.value===difficulty;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});break;
    case 'help':showHelp();break;
    case 'settings':showSettings();break;
    case 'archive':showArchive();break;
    case 'close':if(overlayKind!=='upgrade')closeDialog();break;
    case 'pause':pauseGame();break;
    case 'home':if(sim.mode==='running')pauseGame();else returnHome();break;
    case 'quit':recordRun(false,true);returnHome();break;
    case 'endless':sim.continueEndless();overlay.close();overlayKind='';$('#clock-target').textContent='ENDLESS / NO CEILING';showBanner('CONTINUOUS DEPLOYMENT','NO END IN SIGHT.','Uptime restored. Keep the world online.');break;
    case 'sound':settings.audio=!settings.audio;safeWrite('uptime.settings.v1',settings);sound.setEnabled(settings.audio);if(settings.audio)sound.unlock().catch(()=>{});updateSoundButton();break;
    case 'fullscreen':try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}break;
    case 'dash':sim.dash();break;
    case 'nova':sim.nova();break;
    case 'reload':location.reload();break;
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='audio-setting'){settings.audio=e.target.checked;sound.setEnabled(settings.audio);sound.unlock().catch(()=>{});updateSoundButton();}
  if(e.target.id==='volume-setting'){settings.volume=Number(e.target.value)/100;sound.setVolume(settings.volume);}
  if(e.target.id==='quality-setting'){settings.quality=e.target.value;world?.setQuality(settings.quality);}
  if(e.target.id==='motion-setting'){settings.reducedMotion=e.target.checked;if(world)world.reducedMotion=settings.reducedMotion;document.body.classList.toggle('reduced-motion',settings.reducedMotion);}
  safeWrite('uptime.settings.v1',settings);
});
overlay.addEventListener('cancel',e=>{e.preventDefault();if(overlayKind==='upgrade')return;if(overlayKind==='result'){returnHome();return;}closeDialog();});
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(e.code==='Escape'){if(!overlay.open){e.preventDefault();pauseGame();}return;}
  if(overlayKind==='upgrade'&&['Digit1','Digit2','Digit3'].includes(e.code)&&!e.repeat){const choice=sim.choices[Number(e.code.at(-1))-1];if(choice&&sim.chooseUpgrade(choice.id)){overlay.close();overlayKind='';updateLoadout();}return;}
  if(overlay.open)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyQ'].includes(e.code)&&sim.mode==='running'){e.preventDefault();keys.add(e.code);}
  if(e.repeat)return;if(e.code==='Space')sim.dash();if(e.code==='KeyQ')sim.nova();if(e.code==='KeyP')pauseGame();if(e.code==='KeyM')$('#sound-button').click();if(e.code==='KeyF')$('[data-action="fullscreen"]').click();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();clearTouchControls();if(sim.mode==='running')pauseGame();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();if(sim.mode==='running')pauseGame();sound.suspend().catch(()=>{});}else if(settings.audio&&sound.context)sound.unlock().catch(()=>{});});
window.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch')return;
  if(world){world.pointer.x=e.clientX/innerWidth*2-1;world.pointer.y=e.clientY/innerHeight*2-1;}
  if(sim.mode==='running'){
    aimPointer.x=e.clientX;aimPointer.y=e.clientY;aimPointer.active=true;aimPointer.overUI=!!e.target.closest('button,a,dialog');
  }
});
const reticle=$('#aim-reticle');
const touchControls=[
  {state:touch,zone:$('#touch-zone'),base:$('#touch-base'),stick:$('#touch-stick')},
  {state:touchAim,zone:$('#touch-aim-zone'),base:$('#touch-aim-base'),stick:$('#touch-aim-stick')},
];
function resetTouchControl({state,zone,base,stick}){
  const id=state.id;state.id=null;state.x=state.z=0;
  if(id!==null&&zone.hasPointerCapture(id))zone.releasePointerCapture(id);
  base.classList.remove('active');stick.style.transform='translate(0,0)';
}
function clearTouchControls(){touchControls.forEach(resetTouchControl);}
for(const control of touchControls){
  const {state,zone,base,stick}=control;
  zone.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'||sim.mode!=='running'||state.id!==null)return;
    e.preventDefault();zone.setPointerCapture(e.pointerId);state.id=e.pointerId;state.cx=e.clientX;state.cy=e.clientY;aimPointer.active=false;
    base.style.left=`${e.clientX}px`;base.style.top=`${e.clientY}px`;base.classList.add('active');
  });
  zone.addEventListener('pointermove',e=>{
    if(state.id!==e.pointerId)return;
    const dx=e.clientX-state.cx,dy=e.clientY-state.cy,d=Math.max(45,Math.hypot(dx,dy));
    state.x=dx/d;state.z=dy/d;stick.style.transform=`translate(${state.x*35}px,${state.z*35}px)`;
  });
  const release=e=>{if(e.pointerId===state.id)resetTouchControl(control);};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(event,release);
}
function currentAim(){
  if(touchAim.id!==null&&Math.hypot(touchAim.x,touchAim.z)>.12){
    const origin=world.project(sim.player.x,.85,sim.player.z);
    return world.aimAt(origin.x+touchAim.x*120,origin.y+touchAim.z*120,sim.player);
  }
  return aimPointer.active?world.aimAt(aimPointer.x,aimPointer.y,sim.player):null;
}
function handleEvents(events){
  world.handle(events);for(const e of events){if(e.type!=='start')sound.play(e.type);if(e.type==='level')showUpgrade();if(e.type==='error')showError(e);if(e.type==='wave')showBanner(`TRAFFIC WAVE ${String(e.wave).padStart(2,'0')}`,e.text,`Demand is rising. ${sim.enemies.length} requests in flight.`);if(e.type==='boss')showBanner('CRITICAL EVENT / GLOBAL SURGE','THE THUNDERING HERD','Resolve the surge. Keep your instance alive.');if(e.type==='bossDefeated')showBanner('SURGE RESOLVED','PRESSURE RELEASED.','Keep serving until 05:00.');if(e.type==='death'||e.type==='victory'){clearTimeout(bannerTimer);$('#wave-banner').classList.remove('visible');$('#system-status').textContent=e.type==='death'?'INSTANCE OFFLINE':'SERVICE MAINTAINED';const won=e.type==='victory';recordRun(won);resultTimer=setTimeout(()=>{if(sim.mode===(won?'victory':'dead'))showResult(won);},won?900:1100);}}
}
let last=performance.now(),accumulator=0;
function frame(now){
  requestAnimationFrame(frame);const realDelta=(now-last)/1000,dt=Math.min(realDelta,.05);last=now;if(!world||contextLost||document.hidden)return;
  const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x,z=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touch.z;
  if(sim.mode==='running'){accumulator+=Math.min(realDelta,.25);while(accumulator>=1/60&&sim.mode==='running'){sim.step(1/60,{x,z,...currentAim()});accumulator-=1/60;}}else accumulator=0;
  const aiming=sim.mode==='running'&&aimPointer.active&&!aimPointer.overUI;
  document.body.classList.toggle('aiming',aiming);reticle.classList.toggle('visible',aiming);
  if(aiming)reticle.style.transform=`translate(${aimPointer.x}px,${aimPointer.y}px) translate(-50%,-50%)`;
  handleEvents(sim.drainEvents());world.update(dt,sim);sound.update(sim);frames++;frameTime+=realDelta;if(frameTime>=1){fps=Math.round(frames/frameTime);$('#fps').textContent=fps;frames=0;frameTime=0;}if(now-lastHud>70){if(sim.mode!=='menu'){updateHud();updateLabels();}lastHud=now;}
}
try{
  world=new World($('#scene'),settings);
  world.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;sim.pause();toast('Graphics context interrupted. Waiting for your GPU…');});
  world.renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;if(sim.mode==='paused')showDialog('pause',`${dialogHeader('GRAPHICS RESTORED','Your instance is safe.',false)}<p class="dialog-intro">The graphics device was restored. Resume when you are ready.</p><button class="primary-button" data-action="close">RESUME ${icon('play')}</button>`);});
  requestAnimationFrame(()=>{$('#loading').classList.add('loaded');setTimeout(()=>$('#loading').remove(),650);});requestAnimationFrame(frame);
}catch(error){console.error('Graphics initialization failed:',error);$('#loading').remove();showDialog('unsupported',`${dialogHeader('GRAPHICS INITIALIZATION','A little more compute.',false)}<p class="dialog-intro">UPTIME needs WebGL 2 and hardware acceleration. Enable hardware acceleration in your browser, or open this page in a current Chrome, Edge, Firefox, or Safari.</p><button class="primary-button" data-action="reload">TRY AGAIN ${icon('arrow')}</button>`);}
// Explicit development-only hooks for deterministic browser verification.
if(import.meta.env.DEV&&new URLSearchParams(location.search).has('qa'))window.__uptime={sim,world,settings,get fps(){return fps;},advance(seconds,input={x:0,z:0}){for(let i=0;i<seconds*60;i++){sim.step(1/60,input);if(sim.mode!=='running')break;}handleEvents(sim.drainEvents());updateHud();}};
