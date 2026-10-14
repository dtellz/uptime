export const MAX_UPTIME = 0.999999;
export const RUN_DURATION = 300;
export const ARENA_RADIUS = 38;

export const ENEMY_TYPES = {
  request: { name: 'Incoming request', hp: 2.5, speed: 3.1, radius: 0.62, damage: 0.065, xp: 1, color: '#ff8566' },
  context: { name: 'Context overflow', hp: 14, speed: 1.8, radius: 1.05, damage: 0.11, xp: 4, color: '#b49aff' },
  burst: { name: 'Retry storm', hp: 1.8, speed: 5.3, radius: 0.46, damage: 0.045, xp: 1, color: '#ffd08d' },
  agent: { name: 'Recursive agent', hp: 8, speed: 2.3, radius: 0.8, damage: 0.08, xp: 3, color: '#ff577a' },
  boss: { name: 'THE THUNDERING HERD', hp: 320, speed: 1.45, radius: 2.6, damage: 0.18, xp: 35, color: '#ff4d5d' },
};

export const ERRORS = {
  request: { code: '503', title: 'SERVICE UNAVAILABLE', detail: 'Server down. Request could not be processed.' },
  context: { code: '400', title: 'CONTEXT LENGTH EXCEEDED', detail: 'Input exceeded the model context window.' },
  burst: { code: '429', title: 'RATE LIMIT EXCEEDED', detail: 'Too many requests. Retry storm detected.' },
  agent: { code: '500', title: 'INTERNAL SERVER ERROR', detail: 'Inference worker failed to return a response.' },
  boss: { code: 'OOM', title: 'CUDA OUT OF MEMORY', detail: 'GPU allocation failed. Worker restarting.' },
  timeout: { code: '504', title: 'GATEWAY TIMEOUT', detail: 'Upstream inference request timed out.' },
};

export const UPGRADES = [
  { id: 'throughput', title: 'Speculative decoding', category: 'THROUGHPUT', description: 'Think faster. Fire inference bolts 22% more often.', icon: 'bolt', stat: '+22% fire rate', max: 5 },
  { id: 'damage', title: 'Deeper reasoning', category: 'COMPUTE', description: 'Make every token count. Inference bolts deal 35% more damage.', icon: 'core', stat: '+35% bolt damage', max: 5 },
  { id: 'multishot', title: 'Parallel inference', category: 'ARCHITECTURE', description: 'Process another request at the same time with an extra bolt.', icon: 'split', stat: '+1 simultaneous bolt', max: 4 },
  { id: 'orbit', title: 'Attention head', category: 'DEFENSE', description: 'An orbiting attention head resolves requests that get too close.', icon: 'orbit', stat: '+1 orbiting defender', max: 4 },
  { id: 'nova', title: 'Batch processing', category: 'CAPACITY', description: 'A wider garbage collection pulse hits harder and recharges faster.', icon: 'nova', stat: '+25% pulse · −15% cooldown', max: 4 },
  { id: 'magnet', title: 'Extended context', category: 'MEMORY', description: 'Collect more knowledge. Expand your token pickup radius.', icon: 'expand', stat: '+50% collection range', max: 3 },
  { id: 'speed', title: 'Flash attention', category: 'LATENCY', description: 'Reduce movement latency and bring your next dash online sooner.', icon: 'dash', stat: '+14% speed · −12% dash cooldown', max: 3 },
  { id: 'heal', title: 'Rolling restart', category: 'RECOVERY', description: 'Restore 25% uptime immediately. Resume service without interruption.', icon: 'repair', stat: '+0.250000 uptime', max: 99 },
  { id: 'regen', title: 'Self-healing cluster', category: 'RELIABILITY', description: 'Recover uptime slowly when you have avoided errors for 4 seconds.', icon: 'shield', stat: '+0.002 uptime / second', max: 3 },
  { id: 'pierce', title: 'Token streaming', category: 'EFFICIENCY', description: 'Every inference bolt passes through one additional request.', icon: 'stream', stat: '+1 bolt penetration', max: 3 },
];

export function seededRandom(seed = 1) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Simulation {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.reset();
    this.mode = 'menu';
  }

  reset(difficulty = 'standard') {
    this.random = seededRandom(this.seed++);
    this.difficulty = difficulty;
    this.mode = 'running';
    this.time = 0;
    this.id = 0;
    this.wave = 1;
    this.kills = 0;
    this.tokens = 0;
    this.errors = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTime = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = 8;
    this.spawnTimer = 0.6;
    this.fireTimer = 0.1;
    this.orbitTimer = 0;
    this.shotId = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.endless = false;
    this.events = [];
    this.enemies = [];
    this.bullets = [];
    this.hostiles = [];
    this.pickups = [];
    this.upgrades = {};
    this.choices = [];
    this.lastError = null;
    this.player = { x: 0, z: 0, vx: 0, vz: 0, facingX: 0, facingZ: -1, uptime: MAX_UPTIME, invulnerable: 1.8, dashTime: 0, dashCooldown: 0, novaCooldown: 0, lastHit: -10 };
    this.stats = { speed: 8.1, fireInterval: 0.3, damage: 2, multishot: 1, pierce: 0, orbit: 0, magnet: 3.2, regen: 0, novaRadius: 12, novaDamage: 14, novaCooldown: 15, dashCooldown: 2.8 };
    this.emit('start');
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { const events = this.events; this.events = []; return events; }
  get boss() { return this.enemies.find(e => e.type === 'boss' && e.hp > 0); }

  pause() {
    if (this.mode === 'running') { this.mode = 'paused'; return true; }
    return false;
  }
  resume() { if (this.mode === 'paused') this.mode = 'running'; }

  dash() {
    const p = this.player;
    if (this.mode !== 'running' || p.dashCooldown > 0) return false;
    p.dashTime = 0.24;
    p.invulnerable = Math.max(p.invulnerable, 0.42);
    p.dashCooldown = this.stats.dashCooldown;
    this.emit('dash', { x: p.x, z: p.z, dx: p.facingX, dz: p.facingZ });
    return true;
  }

  nova() {
    const p = this.player;
    if (this.mode !== 'running' || p.novaCooldown > 0) return false;
    p.novaCooldown = this.stats.novaCooldown;
    p.invulnerable = Math.max(p.invulnerable, 0.5);
    for (const e of this.enemies) {
      if (Math.hypot(e.x - p.x, e.z - p.z) < this.stats.novaRadius + e.radius) {
        this.hitEnemy(e, this.stats.novaDamage);
        const d = Math.max(0.1, Math.hypot(e.x - p.x, e.z - p.z));
        e.x += (e.x - p.x) / d * 2;
        e.z += (e.z - p.z) / d * 2;
      }
    }
    this.hostiles = this.hostiles.filter(b => Math.hypot(b.x - p.x, b.z - p.z) > this.stats.novaRadius);
    this.emit('nova', { x: p.x, z: p.z, radius: this.stats.novaRadius });
    return true;
  }

  hurt(amount, type = 'request') {
    const p = this.player;
    if (p.invulnerable > 0 || this.mode !== 'running') return false;
    const damage = amount * (this.difficulty === 'overclocked' ? 1.25 : 1);
    p.uptime = Math.max(0, p.uptime - damage);
    p.lastHit = this.time;
    p.invulnerable = 0.8;
    this.errors++;
    this.combo = 0;
    this.lastError = { ...(ERRORS[type] || ERRORS.request), damage, time: this.time };
    this.emit('error', { ...this.lastError, x: p.x, z: p.z });
    if (p.uptime <= 0) {
      this.mode = 'dead';
      this.emit('death', { x: p.x, z: p.z });
    }
    return true;
  }

  spawnEnemy(type, options = {}) {
    if (this.enemies.length >= 220) return null;
    const def = ENEMY_TYPES[type];
    const angle = this.random() * Math.PI * 2;
    const radius = 23 + this.random() * 7;
    let x = this.player.x + Math.cos(angle) * radius;
    let z = this.player.z + Math.sin(angle) * radius;
    const d = Math.hypot(x, z);
    if (d > ARENA_RADIUS + 2) { x *= (ARENA_RADIUS + 2) / d; z *= (ARENA_RADIUS + 2) / d; }
    const scaling = type === 'boss' ? 1 : 1 + this.time / 240;
    const hp = def.hp * scaling * (this.difficulty === 'overclocked' ? 1.22 : 1);
    const enemy = { ...def, id: ++this.id, type, x, z, hp, maxHp: hp, phase: this.random() * 6.28, age: 0, fireTimer: 2 + this.random() * 2, flash: 0, ...options };
    this.enemies.push(enemy);
    return enemy;
  }

  hitEnemy(enemy, damage) {
    if (enemy.hp <= 0) return;
    enemy.hp -= damage;
    enemy.flash = 0.12;
    if (enemy.hp > 0) return;
    this.kills++;
    this.combo++;
    this.comboTime = 3;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.tokens += Math.round(128 * enemy.xp * (1 + Math.min(this.combo, 50) / 100));
    this.emit('kill', { x: enemy.x, z: enemy.z, color: enemy.color, boss: enemy.type === 'boss' });
    this.pickups.push({ id: ++this.id, x: enemy.x, z: enemy.z, value: enemy.xp, age: 0, repair: enemy.type !== 'boss' && this.random() < 0.035 });
    if (enemy.type === 'boss') { this.bossDefeated = true; this.emit('bossDefeated'); }
  }

  gainXP(amount) {
    this.xp += amount;
    if (this.xp >= this.xpNext && this.mode === 'running') this.levelUp();
  }

  levelUp() {
    this.xp -= this.xpNext;
    this.level++;
    this.xpNext = Math.round(8 + (this.level - 1) * 4.4);
    const available = UPGRADES.filter(u => (this.upgrades[u.id] || 0) < u.max && (u.id !== 'heal' || this.player.uptime < 0.85));
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    this.choices = available.slice(0, 3);
    this.mode = 'upgrade';
    this.emit('level', { level: this.level });
  }

  chooseUpgrade(id) {
    if (this.mode !== 'upgrade' || !this.choices.some(u => u.id === id)) return false;
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    const s = this.stats;
    switch (id) {
      case 'throughput': s.fireInterval /= 1.22; break;
      case 'damage': s.damage *= 1.35; break;
      case 'multishot': s.multishot++; break;
      case 'orbit': s.orbit++; break;
      case 'nova': s.novaRadius *= 1.12; s.novaDamage *= 1.25; s.novaCooldown *= 0.85; break;
      case 'magnet': s.magnet *= 1.5; break;
      case 'speed': s.speed *= 1.14; s.dashCooldown *= 0.88; break;
      case 'heal': this.player.uptime = Math.min(MAX_UPTIME, this.player.uptime + 0.25); break;
      case 'regen': s.regen += 0.002; break;
      case 'pierce': s.pierce++; break;
    }
    this.choices = [];
    this.mode = 'running';
    this.player.invulnerable = Math.max(1, this.player.invulnerable);
    this.emit('upgrade', { id });
    if (this.xp >= this.xpNext) this.levelUp();
    return true;
  }

  continueEndless() {
    if (this.mode !== 'victory') return;
    this.endless = true;
    this.mode = 'running';
    this.player.uptime = MAX_UPTIME;
    this.player.invulnerable = 2;
    this.emit('endless');
  }

  step(delta, input = { x: 0, z: 0 }) {
    if (this.mode !== 'running') return;
    const dt = Math.min(Math.max(delta, 0), 0.05);
    this.time += dt;
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.novaCooldown = Math.max(0, p.novaCooldown - dt);
    this.comboTime -= dt;
    if (this.comboTime <= 0) this.combo = 0;
    if (this.time - p.lastHit > 4 && this.stats.regen) p.uptime = Math.min(MAX_UPTIME, p.uptime + this.stats.regen * dt);

    let mx = Number.isFinite(input.x) ? input.x : 0;
    let mz = Number.isFinite(input.z) ? input.z : 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (ml > 0.1) { p.facingX = mx / Math.hypot(mx, mz); p.facingZ = mz / Math.hypot(mx, mz); }
    let speed = this.stats.speed;
    if (p.dashTime > 0) { p.dashTime -= dt; mx = p.facingX; mz = p.facingZ; speed *= 4.2; }
    const blend = 1 - Math.exp(-18 * dt);
    p.vx += (mx * speed - p.vx) * blend;
    p.vz += (mz * speed - p.vz) * blend;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const pd = Math.hypot(p.x, p.z);
    if (pd > ARENA_RADIUS - 2) { p.x *= (ARENA_RADIUS - 2) / pd; p.z *= (ARENA_RADIUS - 2) / pd; }

    const wave = Math.floor(this.time / 40) + 1;
    if (wave > this.wave) {
      this.wave = wave;
      this.emit('wave', { wave, text: ['GLOBAL TRAFFIC RISING', 'CONTEXT PRESSURE', 'RETRY STORM', 'AGENT RECURSION', 'PEAK DEMAND', 'MEMORY SATURATION', 'THE THUNDERING HERD'][Math.min(wave - 2, 6)] });
      for (let i = 0; i < Math.min(10 + wave * 2, 26); i++) this.spawnEnemy(wave % 2 === 0 ? 'burst' : 'request');
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.13, 0.8 - this.time * 0.0021) / (this.difficulty === 'overclocked' ? 1.35 : 1);
      const r = this.random();
      const type = this.time > 90 && r < 0.12 ? 'agent' : this.time > 30 && r < 0.31 ? 'context' : this.time > 15 && r < 0.54 ? 'burst' : 'request';
      this.spawnEnemy(type);
    }
    if (this.time >= 260 && !this.bossSpawned) {
      this.bossSpawned = true;
      this.spawnEnemy('boss');
      this.emit('boss');
    }

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x, dz = p.z - e.z;
      const dist = Math.max(0.01, Math.hypot(dx, dz));
      const speedFactor = e.type === 'burst' ? 0.85 + Math.max(0, Math.sin(e.age * 3 + e.phase)) * 0.7 : 1;
      const approach = e.type === 'agent' && dist < 10 ? 0.25 : 1;
      const wiggle = Math.sin(e.age * 1.8 + e.phase) * 0.45;
      e.x += (dx / dist * e.speed * speedFactor * approach + dz / dist * wiggle) * dt;
      e.z += (dz / dist * e.speed * speedFactor * approach - dx / dist * wiggle) * dt;
      if (e.type === 'agent' || e.type === 'boss') {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && this.hostiles.length < 150) {
          e.fireTimer = e.type === 'boss' ? 1.8 : 3.5;
          const n = e.type === 'boss' ? 12 : 1;
          for (let i = 0; i < n && this.hostiles.length < 160; i++) {
            const a = n === 1 ? Math.atan2(dz, dx) : i / n * Math.PI * 2 + e.age * 0.3;
            this.hostiles.push({ id: ++this.id, x: e.x, z: e.z, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, life: 5, type: 'timeout' });
          }
          this.emit('hostileFire', { x: e.x, z: e.z });
        }
      }
      if (dist < e.radius + 0.65 && e.age > 0.65) {
        this.hurt(e.damage, e.type);
        e.x -= dx / dist * 1.8;
        e.z -= dz / dist * 1.8;
        if (this.mode === 'dead') return;
      }
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.enemies.length) {
      const targets = this.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 24).sort((a, b) => (a.x-p.x)**2+(a.z-p.z)**2 - (b.x-p.x)**2-(b.z-p.z)**2);
      if (targets.length) {
        this.fireTimer = this.stats.fireInterval;
        for (let i = 0; i < this.stats.multishot; i++) {
          const t = targets[i % targets.length];
          const a = Math.atan2(t.z - p.z, t.x - p.x) + (i >= targets.length ? (i % 2 ? 0.06 : -0.06) : 0);
          this.bullets.push({ id: ++this.id, x: p.x, z: p.z, vx: Math.cos(a) * 36, vz: Math.sin(a) * 36, life: 0.85, damage: this.stats.damage, remaining: this.stats.pierce + 1, hits: new Set() });
        }
        this.emit('fire');
      }
    }

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.remaining <= 0 || b.hits.has(e.id)) continue;
        if (Math.hypot(b.x - e.x, b.z - e.z) < e.radius + 0.55) {
          b.hits.add(e.id);
          this.hitEnemy(e, b.damage);
          b.remaining--;
          this.emit('impact', { x: b.x, z: b.z, color: e.color });
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0 && b.remaining > 0).slice(-250);
    for (const b of this.hostiles) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (Math.hypot(b.x - p.x, b.z - p.z) < 0.85) {
        this.hurt(0.055, b.type);
        b.life = 0;
        if (this.mode === 'dead') return;
      }
    }
    this.hostiles = this.hostiles.filter(b => b.life > 0);

    this.orbitTimer -= dt;
    if (this.stats.orbit && this.orbitTimer <= 0) {
      this.orbitTimer = 0.24;
      for (let i = 0; i < this.stats.orbit; i++) {
        const a = this.time * 2.2 + i / this.stats.orbit * Math.PI * 2;
        const ox = p.x + Math.cos(a) * 3.2, oz = p.z + Math.sin(a) * 3.2;
        for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - ox, e.z - oz) < e.radius + 1.3) this.hitEnemy(e, this.stats.damage * 1.6);
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const t of this.pickups) {
      t.age += dt;
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
      if (d < this.stats.magnet) { const speed = Math.min(d, dt * (10 + 30 / Math.max(d, 0.2))); t.x += dx / Math.max(d, 0.01) * speed; t.z += dz / Math.max(d, 0.01) * speed; }
      if (d < 0.8) {
        t.collected = true;
        if (t.repair) { p.uptime = Math.min(MAX_UPTIME, p.uptime + 0.05); this.emit('repair'); }
        this.gainXP(t.value);
        this.emit('pickup', { value: t.value });
      }
    }
    this.pickups = this.pickups.filter(t => !t.collected).slice(-400);
    if (this.time >= RUN_DURATION && this.bossDefeated && !this.endless && this.mode === 'running') {
      this.mode = 'victory';
      this.emit('victory');
    }
  }
}
