// React Three Fiber helpers for Utopia games. Import from '@/sdk/r3f'.
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree, type CanvasProps } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { GameContext } from './types';

const GameCtx = createContext<GameContext | null>(null);

/** Access the GameContext from any component inside a mountR3F tree. */
export function useGame(): GameContext {
  const c = useContext(GameCtx);
  if (!c) throw new Error('useGame must be used inside mountR3F');
  return c;
}

/** Drives R3F rendering from the pause-aware game loop (frameloop="never"). useFrame delta is pause-aware. */
function Driver() {
  const ctx = useGame();
  const advance = useThree((s) => s.advance);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    let slow = 0;
    let dpr = ctx.quality.maxDpr;
    const stop = ctx.loop((dt, t) => {
      advance(t / 1000);
      // Simple FPS governor: sustained slow frames → lower DPR.
      if (dt > 24) slow += dt;
      else slow = Math.max(0, slow - dt * 0.5);
      if (slow > 3000 && dpr > 0.75) {
        dpr = Math.max(0.75, dpr - 0.25);
        setDpr(dpr);
        slow = 0;
      }
    }, -100);
    return stop;
  }, [ctx, advance, setDpr]);
  return null;
}

export interface MountR3FOptions {
  camera?: CanvasProps['camera'];
  orthographic?: boolean;
  shadows?: boolean;
  background?: string;
}

/**
 * Mount an R3F scene into ctx.container. Returns an unmount function (call it from destroy()).
 * The Canvas uses frameloop="never" and is advanced by ctx.loop, so pausing the game pauses rendering.
 */
export function mountR3F(ctx: GameContext, scene: ReactNode, opts: MountR3FOptions = {}): () => void {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;touch-action:none;';
  ctx.container.appendChild(el);
  const root = createRoot(el);
  root.render(
    <GameCtx.Provider value={ctx}>
      <Canvas
        frameloop="never"
        dpr={[1, ctx.quality.maxDpr]}
        orthographic={opts.orthographic}
        shadows={opts.shadows && ctx.quality.tier !== 'low'}
        camera={opts.camera ?? { position: [0, 0, 10], fov: 45 }}
        gl={{
          antialias: ctx.quality.tier !== 'low',
          powerPreference: 'high-performance',
          preserveDrawingBuffer: ctx.mode === 'preview',
          alpha: false,
        }}
        style={{ touchAction: 'none' }}
      >
        {opts.background && <color attach="background" args={[opts.background]} />}
        <Driver />
        {scene}
      </Canvas>
    </GameCtx.Provider>,
  );
  return () => {
    el.remove();
    // Defer: destroy() is often called from the host app's React effect cleanup, and React
    // forbids synchronously unmounting a root while another root is rendering.
    setTimeout(() => root.unmount(), 0);
  };
}

/** Standard Utopia post-processing (bloom + vignette + subtle grain), tier/setting aware. */
export function GameEffects({ bloom = 1, threshold = 0.2, grain = true }: { bloom?: number; threshold?: number; grain?: boolean }) {
  const ctx = useGame();
  if (!ctx.quality.postFx) return null;
  const hc = ctx.settings.highContrast;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom intensity={bloom * (hc ? 0.4 : 1)} luminanceThreshold={threshold} luminanceSmoothing={0.3} mipmapBlur />
      <Vignette eskil={false} offset={0.25} darkness={hc ? 0 : 0.6} />
      {grain && !hc && ctx.quality.tier === 'high' ? <Noise opacity={0.025} /> : <></>}
    </EffectComposer>
  );
}

export interface BurstHandle {
  burst(pos: THREE.Vector3 | [number, number, number], count?: number, opts?: { color?: string; speed?: number; life?: number; gravity?: number; size?: number }): void;
}

/** Pooled additive point-particle bursts. Use a ref: ref.current.burst([x,y,z], 30, {color}). */
export const ParticleBurst = forwardRef<BurstHandle, { max?: number; size?: number }>(function ParticleBurst({ max = 400, size = 0.12 }, ref) {
  const ctx = useGame();
  const cap = Math.max(40, Math.floor(max * ctx.quality.particleScale));
  const data = useMemo(() => {
    const pos = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 3);
    const vel = new Float32Array(cap * 3);
    const life = new Float32Array(cap);
    const maxLife = new Float32Array(cap).fill(1);
    const grav = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (let i = 0; i < cap; i++) pos[i * 3 + 1] = -9999;
    return { pos, col, vel, life, maxLife, grav, g, next: 0 };
  }, [cap]);
  const tex = useMemo(() => softDotTexture(), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useImperativeHandle(ref, () => ({
    burst(p, count = 24, o = {}) {
      const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z];
      const n = Math.max(1, Math.round(count * ctx.quality.particleScale));
      tmp.set(o.color ?? '#ffffff');
      const speed = o.speed ?? 2;
      for (let k = 0; k < n; k++) {
        const i = data.next;
        data.next = (data.next + 1) % cap;
        data.pos[i * 3] = x;
        data.pos[i * 3 + 1] = y;
        data.pos[i * 3 + 2] = z;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const s = speed * (0.4 + Math.random() * 0.6);
        data.vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
        data.vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * s;
        data.vel[i * 3 + 2] = Math.cos(ph) * s;
        data.life[i] = data.maxLife[i] = (o.life ?? 1) * (0.6 + Math.random() * 0.4);
        data.grav[i] = o.gravity ?? 0;
        data.col[i * 3] = tmp.r;
        data.col[i * 3 + 1] = tmp.g;
        data.col[i * 3 + 2] = tmp.b;
      }
    },
  }));

  useFrame((_, dt) => {
    const { pos, vel, life, maxLife, col, grav, g } = data;
    let any = false;
    for (let i = 0; i < cap; i++) {
      if (life[i] <= 0) continue;
      any = true;
      life[i] -= dt;
      const k = Math.max(0, life[i] / maxLife[i]);
      vel[i * 3 + 1] -= grav[i] * dt;
      vel[i * 3] *= 0.97;
      vel[i * 3 + 1] *= 0.97;
      vel[i * 3 + 2] *= 0.97;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      col[i * 3] *= 0.985 + 0.015 * k;
      col[i * 3 + 1] *= 0.985 + 0.015 * k;
      col[i * 3 + 2] *= 0.985 + 0.015 * k;
      if (life[i] <= 0) pos[i * 3 + 1] = -9999;
    }
    if (any) {
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    }
  });

  return (
    <points geometry={data.g} frustumCulled={false}>
      <pointsMaterial
        size={size}
        map={tex}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
});

let dotTex: THREE.Texture | null = null;
/** Shared soft radial dot texture for sprites/points. */
export function softDotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** Drifting ambient motes (fireflies/dust). Static when reduced motion is on. */
export function Motes({ count = 120, area = [12, 8, 6], color = '#ffe8a8', size = 0.08, speed = 0.15 }: { count?: number; area?: [number, number, number]; color?: string; size?: number; speed?: number }) {
  const ctx = useGame();
  const n = Math.max(10, Math.floor(count * ctx.quality.particleScale));
  const ref = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = Math.random() * 100;
      seeds[i * 3 + 1] = Math.random() * 100;
      seeds[i * 3 + 2] = Math.random() * 100;
      pos[i * 3] = (Math.random() - 0.5) * area[0];
      pos[i * 3 + 1] = (Math.random() - 0.5) * area[1];
      pos[i * 3 + 2] = (Math.random() - 0.5) * area[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geo, seeds };
  }, [n, area]);
  const base = useMemo(() => (geo.attributes.position.array as Float32Array).slice(), [geo]);
  useFrame((state) => {
    if (ctx.settings.reducedMotion) return;
    const t = state.clock.elapsedTime * speed;
    const p = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < n; i++) {
      p[i * 3] = base[i * 3] + Math.sin(t + seeds[i * 3]) * 0.5;
      p[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.8 + seeds[i * 3 + 1]) * 0.4;
      p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.6 + seeds[i * 3 + 2]) * 0.3;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial size={size} map={softDotTexture()} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Full-screen vertical gradient backdrop (placed far behind the scene). */
export function GradientSky({ top, bottom, radius = 60 }: { top: string; bottom: string; radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
          void main(){ float h = smoothstep(-0.6, 0.8, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`,
      }),
    [top, bottom],
  );
  return (
    <mesh material={mat} renderOrder={-10}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}
