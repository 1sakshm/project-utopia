// The Utopia orb: the player's companion and the app's mascot.
//   <Orb>      CSS orb (cheap): wallet, tabs, avatars, fallbacks.
//   <OrbHero>  WebGL orb: swirling shader core, fresnel rim, orbiting sparks, halo. Reacts to taps and pointer.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useEconomy } from '@/platform/economy';
import { SKINS, type SkinDef } from '@/platform/shop';
import { prefersReducedMotion } from '@/platform/settings';

export function useSkin(): SkinDef {
  const id = useEconomy((s) => s.equipped.skin);
  return SKINS.find((k) => k.id === id) ?? SKINS[0];
}

export function Orb({ size = 28, skin, className = '', spin = true }: { size?: number; skin?: SkinDef; className?: string; spin?: boolean }) {
  const mine = useSkin();
  const k = skin ?? mine;
  return (
    <span
      className={`orb ${spin ? 'is-spin' : ''} ${className}`}
      style={{ '--orb': k.gradient, '--orb-glow': k.glow, '--orb-hi': k.stops[0], '--orb-mid': k.stops[1], '--orb-rim': k.stops[2], width: size, height: size } as CSSProperties}
      aria-hidden
    >
      <i className="orb-swirl" />
      <i className="orb-shine" />
    </span>
  );
}

// ---------------------------------------------------------------- WebGL hero orb

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const ORB_VERT = /* glsl */ `
uniform float uTime; uniform float uPulse;
varying vec3 vNormal; varying vec3 vPos; varying vec3 vView;
${NOISE}
void main(){
  vec3 p = position;
  // A pearl, not a rock: barely-there breathing, a jelly wobble only when tapped.
  float n = snoise(normal * 1.2 + vec3(0., uTime * .4, 0.));
  p += normal * (n * (.006 + uPulse * .09));
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vNormal = normalize(normalMatrix * normal);
  vPos = position;
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ORB_FRAG = /* glsl */ `
uniform float uTime; uniform float uPulse;
uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;
varying vec3 vNormal; varying vec3 vPos; varying vec3 vView;
${NOISE}
void main(){
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(-.5, .62, .75));
  // Same ramp as the CSS orb: highlight → core → rim → shadow, lit from the top-left.
  float k = 1. - clamp(dot(N, L) * .5 + .5, 0., 1.);
  vec3 col = mix(c0, c1, smoothstep(.0, .38, k));
  col = mix(col, c2, smoothstep(.36, .74, k));
  col = mix(col, c3, smoothstep(.72, 1., k));
  // Slow liquid bands drifting through the pearl.
  float t = uTime * .18;
  float n = snoise(vPos * .9 + vec3(t, t * .6, -t * .4));
  float bands = sin((vPos.y * 2.2 + vPos.x * .8 + n * 1.4) * 3.0 + uTime * .7);
  col = mix(col, c1, smoothstep(.55, 1., bands) * .12);
  col = mix(col, c0, smoothstep(.85, 1., bands) * .08 * (1. - k));
  // Gloss + rim light.
  vec3 H = normalize(L + vView);
  float spec = pow(max(dot(N, H), 0.), 26.) * .32 + pow(max(dot(N, H), 0.), 6.) * .08;
  float fres = pow(1. - max(dot(N, vView), 0.), 3.);
  col += vec3(1.) * spec;
  col += c1 * fres * (.28 + uPulse * .8);
  // A touch of film: desaturate a little and warm the shadows.
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, .82) * vec3(1.02, 1., .95);
  gl_FragColor = vec4(col, 1.);
}`;

const HALO_FRAG = /* glsl */ `
uniform vec3 c1; uniform vec3 c2; uniform float uPulse; uniform float uTime;
varying vec2 vUv;
void main(){
  float d = length(vUv - .5) * 2.;
  float a = smoothstep(1., .35, d) * (.32 + uPulse * .4) * (.92 + .08 * sin(uTime * 1.7));
  vec3 col = mix(c1, c2, smoothstep(.3, 1., d));
  gl_FragColor = vec4(col * a, a);
}`;

const SPARK_VERT = /* glsl */ `
uniform float uTime; uniform float uPulse; attribute float aSeed; varying float vA;
void main(){
  float ang = aSeed * 6.2831 + uTime * (.25 + fract(aSeed * 7.13) * .35);
  float r = 1.25 + fract(aSeed * 13.7) * .3 + uPulse * .25;
  float y = (fract(aSeed * 3.1) - .5) * .5;
  vec3 p = vec3(cos(ang) * r, y + sin(ang) * r * .28, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vA = .45 + .55 * sin(uTime * 2.2 + aSeed * 40.);
  gl_PointSize = (3.5 + fract(aSeed * 21.) * 5.) * (3.2 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const SPARK_FRAG = /* glsl */ `
uniform vec3 c0; uniform vec3 c1; varying float vA;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, 0., d) * vA;
  gl_FragColor = vec4(mix(c1, c0, .6) * a, a);
}`;

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Big interactive 3D orb. Falls back to the CSS orb without WebGL or with reduced motion. */
export function OrbHero({ size = 260, onTap, skin, pulseKey = 0 }: { size?: number; onTap?: () => void; skin?: SkinDef; pulseKey?: number }) {
  const mine = useSkin();
  const k = skin ?? mine;
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ pulse: () => void; colors: (s: SkinDef) => void } | null>(null);
  const [gl, setGl] = useState(() => !prefersReducedMotion() && webglOk());
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!gl || !box.current) return;
    const el = box.current;
    let disposed = false;
    let cleanup = () => {};
    void import('three')
      .then((THREE) => {
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.setClearColor(0x000000, 0);
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
        cam.position.set(0, 0, 6.4);

        const col = (h: string) => new THREE.Color(h);
        const uniforms = {
          uTime: { value: 0 },
          uPulse: { value: 0 },
          c0: { value: col(k.stops[0]) },
          c1: { value: col(k.stops[1]) },
          c2: { value: col(k.stops[2]) },
          c3: { value: col(k.stops[3]) },
        };
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 48), new THREE.ShaderMaterial({ vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, uniforms }));
        const halo = new THREE.Mesh(
          new THREE.PlaneGeometry(3.6, 3.6),
          new THREE.ShaderMaterial({
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
            fragmentShader: HALO_FRAG,
            uniforms,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        halo.position.z = -0.6;
        const N = 28;
        const seeds = new Float32Array(N).map(() => Math.random());
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
        const sparks = new THREE.Points(
          sg,
          new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        sparks.frustumCulled = false;
        sparks.rotation.x = 0.35;
        scene.add(halo, orb, sparks);

        let pulse = 0;
        let mx = 0;
        let my = 0;
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
          my = ((e.clientY - r.top) / r.height - 0.5) * 2;
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        api.current = {
          pulse: () => (pulse = 1),
          colors: (s) => {
            uniforms.c0.value.set(s.stops[0]);
            uniforms.c1.value.set(s.stops[1]);
            uniforms.c2.value.set(s.stops[2]);
            uniforms.c3.value.set(s.stops[3]);
          },
        };

        let raf = 0;
        let visible = true;
        const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
        io.observe(el);
        const t0 = performance.now();
        let last = t0;
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          if (!visible || document.hidden) return;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          pulse = Math.max(0, pulse - dt * 1.6);
          uniforms.uTime.value = (now - t0) / 1000;
          uniforms.uPulse.value = pulse * pulse;
          orb.rotation.y += dt * 0.25;
          orb.rotation.x += (my * 0.35 - orb.rotation.x) * 0.05;
          orb.rotation.z += (-mx * 0.2 - orb.rotation.z) * 0.05;
          const s = 1 + Math.sin(uniforms.uTime.value * 1.4) * 0.018 + pulse * pulse * 0.12;
          orb.scale.setScalar(s);
          sparks.rotation.y += dt * 0.1;
          renderer.render(scene, cam);
        };
        raf = requestAnimationFrame(tick);
        const ro = new ResizeObserver(() => renderer.setSize(el.clientWidth, el.clientHeight));
        ro.observe(el);
        setLive(true);
        cleanup = () => {
          cancelAnimationFrame(raf);
          io.disconnect();
          ro.disconnect();
          window.removeEventListener('pointermove', onMove);
          scene.traverse((o) => {
            const m = o as import('three').Mesh;
            m.geometry?.dispose();
            (m.material as import('three').Material | undefined)?.dispose?.();
          });
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          api.current = null;
        };
      })
      .catch(() => setGl(false));
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => api.current?.colors(k), [k]);
  useEffect(() => {
    if (pulseKey) api.current?.pulse();
  }, [pulseKey]);

  return (
    <div
      className={`orb-hero ${live ? 'is-live' : ''}`}
      style={{ width: size, height: size, '--orb-glow': k.glow } as CSSProperties}
      onPointerDown={() => {
        api.current?.pulse();
        onTap?.();
      }}
      role={onTap ? 'button' : undefined}
      aria-label={onTap ? 'Your orb' : undefined}
    >
      {!live && <Orb size={size * 0.46} skin={k} className="orb-hero-fallback" />}
      <div ref={box} className="orb-hero-gl" />
    </div>
  );
}
