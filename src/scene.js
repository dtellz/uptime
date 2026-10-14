import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARENA_RADIUS, ENEMY_TYPES, seededRandom } from './simulation.js';

const MINT = 0x9dffdb;
const GOLD = 0xffc58a;
const clamp = THREE.MathUtils.clamp;
const scratch = new THREE.Object3D();
const color = new THREE.Color();
const v3 = new THREE.Vector3();
const neon = (c, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(intensity), toneMapped: false });

const postShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, damage: { value: 0 }, vignette: { value: 0.38 }, motion: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, damage, vignette, motion;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 p = vUv - .5;
      float offset = (.0005 + damage * .006) * motion;
      vec3 c = vec3(texture2D(tDiffuse, vUv+p*offset).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-p*offset).b);
      c *= 1.0 - smoothstep(.2, .78, length(p)) * vignette;
      c += (hash(vUv * 1500. + fract(time) * 100.) - .5) * .006;
      c += vec3(.22, .006, .003) * damage * smoothstep(.2, .68, length(p));
      gl_FragColor = vec4(c, 1.);
    }
  `,
};

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.12, '#ffffff'); g.addColorStop(0.35, '#ffffff50'); g.addColorStop(1, '#ffffff00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class World {
  constructor(container, options = {}) {
    this.container = container;
    this.quality = options.quality || 'high';
    this.reducedMotion = options.reducedMotion || false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor(0x050a0d);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality === 'high' ? 1.65 : 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'UPTIME three-dimensional neural arena');
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.06);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.6;
    room.dispose();
    pmrem.dispose();
    this.scene.fog = new THREE.FogExp2(0x050c10, 0.014);
    this.camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 260);
    this.camera.position.set(17, 15, 27);
    this.camera.lookAt(-7, 1, 0);
    this.target = new THREE.Vector3(-7, 1, 0);
    this.cameraGoal = new THREE.Vector3();
    this.targetGoal = new THREE.Vector3();
    this.pointer = { x: 0, y: 0 };
    this.damage = 0;
    this.shake = 0;
    this.clock = 0;
    this.transition = 0;
    this.particles = [];
    this.rings = [];
    this.glowTexture = makeGlowTexture();
    this.random = seededRandom(8429);

    this.scene.add(new THREE.AmbientLight(0x648a9d, 1.1));
    const sun = new THREE.DirectionalLight(0xbbd7df, 3);
    sun.position.set(10, 20, 8); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x54ffcd, 2);
    rim.position.set(-15, 6, -10); this.scene.add(rim);
    this.coreLight = new THREE.PointLight(MINT, 28, 23, 1.6);
    this.coreLight.position.set(0, 3, 0); this.scene.add(this.coreLight);
    this.createFloor();
    this.createArchitecture();
    this.createCore();
    this.createAmbient();
    this.createInstances();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.65, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.post = new ShaderPass(postShader);
    this.composer.addPass(this.post);
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  createFloor() {
    this.floorMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, core: { value: new THREE.Vector2() }, combatMix: { value: 0 } },
      vertexShader: `varying vec3 p; void main() { vec4 w = modelMatrix * vec4(position,1.); p=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `
        varying vec3 p; uniform float time,combatMix; uniform vec2 core;
        float grid(vec2 p, float size, float width) { vec2 g=abs(fract(p/size-.5)-.5)*size; return 1.-smoothstep(width,width+.03,min(g.x,g.y)); }
        void main(){
          float d=length(p.xz), pd=length(p.xz-core);
          float ring=1.-smoothstep(.025,.075,abs(mod(d+3.,6.)-3.));
          float major=1.-smoothstep(.035,.11,abs(mod(d+10.,20.)-10.));
          float boundary=1.-smoothstep(.035,.16,abs(d-${ARENA_RADIUS.toFixed(1)}));
          float wave=pow(max(0.,1.-abs(mod(pd-time*2.,18.)-9.)/1.0),3.);
          vec3 c=vec3(.007,.014,.02);
          float detail=1.-combatMix*.25;
          c+=vec3(.006,.015,.018)*grid(p.xz,3.,.012)*detail;
          c+=vec3(.008,.019,.023)*ring*detail;
          c+=vec3(.012,.036,.032)*major;
          c+=vec3(.07,.26,.19)*boundary;
          c+=vec3(.002,.01,.008)*wave;
          c+=vec3(.008,.035,.022)*exp(-pd*.2);
          float spokes=pow(abs(cos(atan(p.z,p.x)*12.)),160.);
          c+=vec3(.002,.006,.006)*spokes*smoothstep(7.,12.,d);
          vec2 tile=fract(p.xz/3.);
          float screw=(1.-smoothstep(.012,.028,length(tile-vec2(.08))))+(1.-smoothstep(.012,.028,length(tile-vec2(.92))));
          c+=vec3(.026,.035,.04)*screw;
          c*=1.-smoothstep(42.,90.,d);
          gl_FragColor=vec4(c,1.);
        }
      `,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(230, 230), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.45;
    this.scene.add(floor);
    this.plinth = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x17272a, metalness: 0.75, roughness: 0.38 });
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 5.6, 0.42, 96), baseMat);
    disk.position.y = -0.4; this.plinth.add(disk);
    for (const r of [3.8, 4.8, 5.4]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 5, 128), neon(MINT, r === 4.8 ? 1.5 : 0.55));
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.15; this.plinth.add(ring);
    }
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 4 === 0 ? 0.025 : 0.015, 0.012, i % 4 === 0 ? 0.3 : 0.12), neon(0x74a99b, 0.75));
      tick.position.set(Math.sin(a)*4.45, -0.15, Math.cos(a)*4.45); tick.rotation.y = a; this.plinth.add(tick);
    }
    this.scene.add(this.plinth);
  }

  createArchitecture() {
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x26333c, roughness: 0.43, metalness: 0.7 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x0b141b, roughness: 0.48, metalness: 0.8 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x34515b, transparent: true, opacity: 0.6 });
    const group = new THREE.Group();
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    const servers = new THREE.InstancedMesh(blockGeo, darkMetal, 80);
    const vents = new THREE.InstancedMesh(blockGeo, darker, 640);
    const indicators = new THREE.InstancedMesh(blockGeo, neon(MINT, 0.85), 640);
    let n = 0, vn = 0;
    for (let ring = 0; ring < 2; ring++) {
      const count = ring ? 44 : 32;
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2 + ring * 0.075;
        const radius = ring ? 52 : 43;
        const h = 2.5 + this.random() * (ring ? 9 : 4);
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        scratch.position.set(x, h/2 - 0.3, z); scratch.rotation.set(0, -a, 0); scratch.scale.set(2.8, h, 2.2); scratch.updateMatrix(); servers.setMatrixAt(n++, scratch.matrix);
        for (let j = 0; j < 7; j++) {
          const y = 0.4 + j / 7 * (h - 0.6);
          const nx = Math.cos(a), nz = Math.sin(a);
          scratch.position.set(x - nx * 1.41, y, z - nz * 1.41); scratch.scale.set(0.035, 0.055, 1.55); scratch.updateMatrix(); vents.setMatrixAt(vn, scratch.matrix);
          scratch.scale.set(0.045, 0.032, 0.1 + this.random() * 0.55); scratch.position.y += 0.08; scratch.updateMatrix(); indicators.setMatrixAt(vn++, scratch.matrix);
        }
        if (ring === 0 && i % 4 === 0) {
          const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.82,h+0.03,2.22)), edgeMat);
          frame.position.set(x,h/2-0.3,z); frame.rotation.y=-a; group.add(frame);
        }
      }
    }
    servers.count=n; vents.count=indicators.count=vn;
    group.add(servers, vents, indicators);

    const nodeGeo = new THREE.CylinderGeometry(1.15, 1.5, 0.6, 6);
    this.nodes = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const node = new THREE.Group();
      node.position.set(Math.cos(a)*23, -0.1, Math.sin(a)*23);
      node.add(new THREE.Mesh(nodeGeo, darkMetal));
      const light = new THREE.Mesh(new THREE.TorusGeometry(0.75,0.025,5,6), neon(MINT,0.7));
      light.rotation.x=Math.PI/2; light.position.y=0.35; node.add(light);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), neon(MINT,1.3));
      crystal.position.y=1.1; node.add(crystal);
      this.nodes.push(crystal); group.add(node);
    }
    this.scene.add(group);
  }

  createCore() {
    this.core = new THREE.Group();
    this.gyro = new THREE.Group();
    this.core.add(this.gyro);
    const metal = new THREE.MeshStandardMaterial({ color: 0x759a94, metalness: 0.92, roughness: 0.24 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x18352f, metalness: 0.8, roughness: 0.25 });
    this.coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.87, 1), new THREE.MeshPhysicalMaterial({color:0x4b9789,metalness:.35,roughness:.1,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));
    this.gyro.add(this.coreShell);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.89,1)), new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.85, toneMapped: false }));
    this.gyro.add(edges);
    this.kernelMaterial = new THREE.ShaderMaterial({
      uniforms:{time:{value:0}},
      vertexShader:`varying vec3 p,n,v; void main(){p=position;n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying vec3 p,n,v; uniform float time;
        float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        void main(){float f=noise(p*5.+vec3(0,time*.22,0))*.6+noise(p*11.-time*.12)*.3+noise(p*24.)*.1;float veins=pow(1.-abs(sin(f*17.+p.y*8.+time*.25)),9.);float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.5);vec3 c=vec3(.016,.075,.06)+vec3(.15,1.2,.78)*veins+vec3(.2,.9,.65)*rim;gl_FragColor=vec4(c,1.);}`,
    });
    this.kernel = new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 40), this.kernelMaterial);
    this.gyro.add(this.kernel);
    this.gyroRings=[];
    for(let j=0;j<3;j++) {
      const ring = new THREE.Group();
      for(let i=0;i<6;i++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.3+j*.13,0.075,8,32,Math.PI/3-0.12), metal);
        arc.rotation.z=i*Math.PI/3; ring.add(arc);
        const strip = new THREE.Mesh(new THREE.TorusGeometry(1.3+j*.13,0.014,5,24,Math.PI/3-0.22), neon(MINT,1.5));
        strip.rotation.z=i*Math.PI/3+.05; strip.position.z=.067; ring.add(strip);
        const end = new THREE.Mesh(new THREE.BoxGeometry(.14,.2,.17),armor);
        end.position.set(Math.cos(i*Math.PI/3)*(1.3+j*.13),Math.sin(i*Math.PI/3)*(1.3+j*.13),0);end.rotation.z=i*Math.PI/3;ring.add(end);
      }
      ring.rotation.set(j*Math.PI/3,j*.8,j*.6);
      this.gyroRings.push(ring); this.gyro.add(ring);
    }
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map:this.glowTexture,color:MINT,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false }));
    flare.scale.set(5,5,1);this.core.add(flare);
    this.coreGlow=flare;
    const count=180;
    const positions=new Float32Array(count*3);
    for(let i=0;i<count;i++) {
      const a=this.random()*Math.PI*2, b=Math.acos(2*this.random()-1),r=1.8+this.random()*.4;
      positions.set([Math.sin(b)*Math.cos(a)*r,Math.cos(b)*r,Math.sin(b)*Math.sin(a)*r],i*3);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.neurons=new THREE.Points(g,new THREE.PointsMaterial({color:MINT,size:.025,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.core.add(this.neurons);
    this.core.position.y=3.8;this.core.scale.setScalar(2.7);
    this.scene.add(this.core);
    this.playerBeacon = new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0xaaffdd,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.playerBeacon.scale.set(5,5,1);this.scene.add(this.playerBeacon);
    this.halo=new THREE.Mesh(new THREE.RingGeometry(1.28,1.34,80),new THREE.MeshBasicMaterial({color:MINT,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
    this.halo.rotation.x=-Math.PI/2;this.halo.position.y=-.25;this.scene.add(this.halo);
    this.orbitals=[];
    for(let i=0;i<4;i++) {
      const drone=new THREE.Group();
      drone.add(new THREE.Mesh(new THREE.OctahedronGeometry(.35),neon(MINT,2)));
      const r=new THREE.Mesh(new THREE.TorusGeometry(.55,.025,5,30),neon(MINT)); r.rotation.x=Math.PI/3;drone.add(r);
      drone.visible=false;this.scene.add(drone);this.orbitals.push(drone);
    }
  }

  createAmbient() {
    const count=1400, positions=new Float32Array(count*3), colors=new Float32Array(count*3);
    for(let i=0;i<count;i++) {
      positions.set([(this.random()-.5)*150,this.random()*35,(this.random()-.5)*150],i*3);
      const c=new THREE.Color(this.random()>.9?GOLD:MINT);c.multiplyScalar(.2+this.random()*.7);colors.set([c.r,c.g,c.b],i*3);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.dust=new THREE.Points(g,new THREE.PointsMaterial({vertexColors:true,size:.045,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(this.dust);
    this.streams=[];
    const streamMat=new THREE.LineBasicMaterial({color:MINT,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,depthWrite:false});
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI*2;
      const points=[];
      for(let j=0;j<36;j++) {const t=j/35;const r=6+t*45;points.push(new THREE.Vector3(Math.cos(a+t*.2)*r,Math.sin(t*Math.PI)*3-.25,Math.sin(a+t*.2)*r));}
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),streamMat);this.scene.add(line);
      const spark=new THREE.Mesh(new THREE.SphereGeometry(.05,5,5),neon(MINT,2));this.scene.add(spark);this.streams.push({points,spark,offset:this.random()});
    }
  }

  createInstances() {
    this.enemyInstances={};
    const geos={request:new THREE.OctahedronGeometry(.72,0),context:new THREE.BoxGeometry(1.25,1.25,1.25),burst:new THREE.TetrahedronGeometry(.68,0),agent:new THREE.IcosahedronGeometry(.78,0),boss:new THREE.IcosahedronGeometry(2.5,1)};
    for(const [type,geo] of Object.entries(geos)) {
      const mat=new THREE.MeshStandardMaterial({color:0x303b40,emissive:ENEMY_TYPES[type].color,emissiveIntensity:.18,metalness:.6,roughness:.26});
      const mesh=new THREE.InstancedMesh(geo,mat,220);mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;this.scene.add(mesh);
      // A slightly enlarged wireframe shell keeps silhouettes readable from above.
      const shell=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:ENEMY_TYPES[type].color,wireframe:true,toneMapped:false,transparent:true,opacity:.85}),220);shell.count=0;shell.frustumCulled=false;this.scene.add(shell);
      const eyeGeo=type==='context'?new THREE.TorusGeometry(.68,.055,5,4):type==='agent'?new THREE.TorusGeometry(.98,.027,5,40):type==='boss'?new THREE.TorusGeometry(2.8,.055,6,64):new THREE.OctahedronGeometry(.19);
      const eyes=new THREE.InstancedMesh(eyeGeo,neon(ENEMY_TYPES[type].color,2.1),220);eyes.count=0;eyes.frustumCulled=false;this.scene.add(eyes);
      this.enemyInstances[type]={mesh,shell,eyes};
    }
    this.bolts=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.12,1.15),neon(0xcaffed,3),250);this.bolts.frustumCulled=false;this.scene.add(this.bolts);
    this.hostileBolts=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.23),neon(0xff5769,2),160);this.hostileBolts.frustumCulled=false;this.scene.add(this.hostileBolts);
    this.gems=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.17),neon(MINT,1.4),400);this.gems.frustumCulled=false;this.scene.add(this.gems);
    this.particleMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({vertexColors:false,toneMapped:false,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}),1600);this.particleMesh.frustumCulled=false;this.scene.add(this.particleMesh);
    this.bolts.count=this.hostileBolts.count=this.gems.count=this.particleMesh.count=0;
    this.ringGeometry=new THREE.RingGeometry(.97,1,100);
  }

  burst(x,z,c,count=20,power=1) {
    for(let i=0;i<count && this.particles.length<1600;i++) {
      const a=this.random()*Math.PI*2, v=(1+this.random()*6)*power;
      this.particles.push({x,y:.5+this.random(),z,vx:Math.cos(a)*v,vy:1+this.random()*6,vz:Math.sin(a)*v,life:.4+this.random()*.6,maxLife:1,color:c,size:.025+this.random()*.075});
    }
  }

  ring(x,z,radius,c=MINT,duration=.65) {
    const mat=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(this.ringGeometry,mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,-.18,z);this.scene.add(mesh);
    this.rings.push({mesh,age:0,duration,radius});
  }

  handle(events) {
    for(const e of events) {
      if(e.type==='start') {this.particles.length=0;for(const r of this.rings){this.scene.remove(r.mesh);r.mesh.material.dispose();}this.rings.length=0;this.damage=0;this.shake=0;}
      if(e.type==='kill') {this.burst(e.x,e.z,e.color,e.boss?150:16,e.boss?3:1);if(e.boss)this.ring(e.x,e.z,25,0xff5268,1.5);}
      if(e.type==='impact') this.burst(e.x,e.z,e.color,3,.4);
      if(e.type==='nova') {this.ring(e.x,e.z,e.radius,MINT,.65);this.ring(e.x,e.z,e.radius*.8,0xffffff,.5);this.burst(e.x,e.z,MINT,90,3);this.shake=.18;}
      if(e.type==='dash') {this.burst(e.x,e.z,MINT,30,1);this.ring(e.x,e.z,2,MINT,.3);}
      if(e.type==='error') {this.damage=1;this.shake=.55;this.burst(e.x,e.z,0xff5564,35,1.5);}
      if(e.type==='level' || e.type==='upgrade') {this.ring(this.core.position.x,this.core.position.z,5,MINT,1);this.burst(this.core.position.x,this.core.position.z,MINT,40,1);}
      if(e.type==='death') {this.burst(e.x,e.z,0xff5564,150,3);this.ring(e.x,e.z,12,0xff5564,1.5);this.shake=.8;}
      if(e.type==='victory') {this.burst(this.core.position.x,this.core.position.z,MINT,200,4);this.ring(this.core.position.x,this.core.position.z,25,MINT,2);}
    }
  }

  update(dt,sim) {
    this.clock+=dt;
    const t=this.clock, menu=sim.mode==='menu';
    const active=sim.mode==='running';
    const motion=this.reducedMotion?0:1;
    const lerp=1-Math.exp(-dt*3.5);
    const narrow=innerWidth/innerHeight<1.1;
    this.transition=THREE.MathUtils.lerp(this.transition,menu?0:1,lerp);
    const p=sim.player;
    const cx=menu?0:p.x,cz=menu?0:p.z;
    this.core.position.x=THREE.MathUtils.lerp(this.core.position.x,cx,menu?lerp:Math.min(1,dt*20));
    this.core.position.z=THREE.MathUtils.lerp(this.core.position.z,cz,menu?lerp:Math.min(1,dt*20));
    this.core.position.y=THREE.MathUtils.lerp(this.core.position.y,menu?4.2+Math.sin(t*.8)*.25*motion:1.0+Math.sin(t*3)*.07*motion,lerp);
    this.core.scale.setScalar(THREE.MathUtils.lerp(this.core.scale.x,menu?2.7:.78,lerp));
    this.core.visible=sim.mode!=='dead';
    this.gyro.rotation.y=t*.15*motion;
    this.coreShell.rotation.y=t*.2*motion;this.neurons.rotation.y=-t*.12*motion;
    this.gyroRings.forEach((r,i)=>{r.rotation.x=i*1.05+Math.sin(t*.23+i)*.6*motion;r.rotation.y=i*.8+t*(i%2?-.22:.16)*motion;});
    this.kernel.scale.setScalar(.88+Math.sin(t*2)*.06);
    this.kernelMaterial.uniforms.time.value=t;
    this.coreGlow.material.opacity=menu?.22: (p.invulnerable>0?.5:.16);
    this.coreLight.position.copy(this.core.position);this.coreLight.intensity=menu?35:12;
    this.playerBeacon.position.copy(this.core.position);this.playerBeacon.visible=!menu&&sim.mode!=='dead';
    this.halo.position.set(this.core.position.x,-.22,this.core.position.z);this.halo.scale.setScalar(menu?2.7:1);this.halo.material.opacity=menu?.3:.55;
    this.plinth.scale.setScalar(1-this.transition*.96);
    this.plinth.visible=this.transition<.99;
    this.nodes.forEach((n,i)=>{n.rotation.y=t*.4;n.position.y=1.05+Math.sin(t+i)*.13;});
    this.dust.rotation.y=t*.003*motion;
    this.streams.forEach(({points,spark,offset})=>{const index=Math.floor((1-(t*.08+offset)%1)*35);spark.position.copy(points[index]);});

    if(menu) {
      this.cameraGoal.set(narrow?11:17,15+this.pointer.y*.6*motion,narrow?39:27);
      this.targetGoal.set(narrow?-1:-7, narrow?-2:1, 0);
      this.cameraGoal.x+=this.pointer.x*1.2*motion;
    } else {
      const height=narrow?53:43;
      this.cameraGoal.set(p.x*.74,height,p.z*.74+27);
      this.targetGoal.set(p.x*.85,0,p.z*.85-2.5);
    }
    this.camera.position.lerp(this.cameraGoal,lerp);
    this.target.lerp(this.targetGoal,lerp);
    this.shake=Math.max(0,this.shake-dt*2);
    if(this.shake>0 && motion){this.camera.position.x+=(this.random()-.5)*this.shake*.7;this.camera.position.y+=(this.random()-.5)*this.shake*.5;}
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.floorMaterial.uniforms.time.value=t;this.floorMaterial.uniforms.core.value.set(cx,cz);this.floorMaterial.uniforms.combatMix.value=this.transition;
    this.damage=Math.max(0,this.damage-dt*2.6);
    this.post.uniforms.time.value=t;this.post.uniforms.damage.value=this.damage;this.post.uniforms.motion.value=motion;
    this.post.uniforms.vignette.value=menu?.55:.32;

    const counts={request:0,context:0,burst:0,agent:0,boss:0};
    for(const e of menu?[]:sim.enemies) {
      const n=counts[e.type]++;
      const inst=this.enemyInstances[e.type];
      const spawn=clamp(e.age*3,0,1);
      scratch.position.set(e.x,.65+Math.sin(t*2.5+e.phase)*.12,e.z);
      if(e.type==='boss')scratch.position.y=2.1;
      scratch.rotation.set(e.type==='context'?Math.PI/4:t*.7+e.phase,t*.8+e.phase,e.type==='context'?Math.PI/4:0);
      scratch.scale.setScalar(spawn*(e.flash>0?1.1:1));scratch.updateMatrix();inst.mesh.setMatrixAt(n,scratch.matrix);inst.shell.setMatrixAt(n,scratch.matrix);
      color.set(e.flash>0?0xffffff:ENEMY_TYPES[e.type].color);inst.shell.setColorAt(n,color);
      scratch.position.y+=e.type==='boss'?.2:.25;scratch.rotation.set(Math.PI/2,e.type==='request'?t:0,t*.4+e.phase);scratch.updateMatrix();inst.eyes.setMatrixAt(n,scratch.matrix);
    }
    for(const [type,inst] of Object.entries(this.enemyInstances)) {inst.mesh.count=inst.shell.count=inst.eyes.count=counts[type];inst.mesh.instanceMatrix.needsUpdate=true;inst.shell.instanceMatrix.needsUpdate=true;inst.eyes.instanceMatrix.needsUpdate=true;if(inst.shell.instanceColor)inst.shell.instanceColor.needsUpdate=true;}

    const bullets=menu?[]:sim.bullets;
    this.bolts.count=bullets.length;
    bullets.forEach((b,i)=>{scratch.position.set(b.x,.85,b.z);scratch.rotation.set(0,Math.atan2(b.vx,b.vz),0);scratch.scale.setScalar(1);scratch.updateMatrix();this.bolts.setMatrixAt(i,scratch.matrix);});this.bolts.instanceMatrix.needsUpdate=true;
    const hostile=menu?[]:sim.hostiles;
    this.hostileBolts.count=hostile.length;
    hostile.forEach((b,i)=>{scratch.position.set(b.x,.7,b.z);scratch.rotation.set(t,t*.5,0);scratch.scale.setScalar(1);scratch.updateMatrix();this.hostileBolts.setMatrixAt(i,scratch.matrix);});this.hostileBolts.instanceMatrix.needsUpdate=true;
    const gems=menu?[]:sim.pickups;
    this.gems.count=gems.length;
    gems.forEach((b,i)=>{scratch.position.set(b.x,.18+Math.sin(t*3+b.id)*.08,b.z);scratch.rotation.set(0,t+b.id,0);scratch.scale.setScalar(b.repair?1.65:b.value>3?1.5:1);scratch.updateMatrix();this.gems.setMatrixAt(i,scratch.matrix);color.set(b.repair?0xffffff:MINT);this.gems.setColorAt(i,color);});this.gems.instanceMatrix.needsUpdate=true;if(this.gems.instanceColor)this.gems.instanceColor.needsUpdate=true;
    this.orbitals.forEach((drone,i)=>{drone.visible=!menu && i<sim.stats.orbit;const a=sim.time*2.2+i/Math.max(1,sim.stats.orbit)*Math.PI*2;drone.position.set(p.x+Math.cos(a)*3.2,1,p.z+Math.sin(a)*3.2);drone.rotation.y=t*3;});

    if(active && p.dashTime>0) this.burst(p.x,p.z,MINT,3,.1);
    this.particles=this.particles.filter(p=>p.life>0);
    this.particleMesh.count=this.particles.length;
    this.particles.forEach((p,i)=>{
      p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=dt*10;p.vx*=Math.exp(-dt*2);p.vz*=Math.exp(-dt*2);
      scratch.position.set(p.x,Math.max(-.3,p.y),p.z);scratch.rotation.set(t*3+i,t+i,0);scratch.scale.set(p.size,p.size,Math.max(p.size,p.size*3));scratch.updateMatrix();this.particleMesh.setMatrixAt(i,scratch.matrix);color.set(p.color).multiplyScalar(Math.max(0,p.life)*2);this.particleMesh.setColorAt(i,color);
    });this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
    this.rings=this.rings.filter(r=>{r.age+=dt;const p=r.age/r.duration;if(p>=1){this.scene.remove(r.mesh);r.mesh.material.dispose();return false;}r.mesh.scale.setScalar(Math.max(.01,r.radius*(1-Math.pow(1-p,3))));r.mesh.material.opacity=(1-p)*.9;return true;});
    if(this.quality==='low')this.renderer.render(this.scene,this.camera);else this.composer.render();
  }

  project(x,y,z) {
    v3.set(x,y,z).project(this.camera);
    return {x:(v3.x*.5+.5)*innerWidth,y:(-v3.y*.5+.5)*innerHeight,visible:v3.z<1 && Math.abs(v3.x)<1.1 && Math.abs(v3.y)<1.1};
  }

  setQuality(quality) {
    this.quality=quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.65:1));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());this.resize();
  }

  resize() {
    const w=this.container.clientWidth,h=this.container.clientHeight;
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.composer.setSize(w,h);
  }

  dispose() {
    window.removeEventListener('resize',this.resize);
    const geometries=new Set(),materials=new Set();
    this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.glowTexture.dispose();this.environment.dispose();this.composer.dispose();this.renderer.dispose();
  }
}
