"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef } from "react";

// Chromatic particle palette from DESIGN.md (violet, amber, teal + assorted purples/blues/magenta).
const COLORS = ["#8052ff", "#ffb829", "#15846e", "#a07bff", "#5b8cff", "#ff5fa2", "#2fd1b0"];

// Seeded PRNG so server and client render the same field (no hydration mismatch).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Particle = {
  x: number;
  y: number;
  size: number;
  rot: number;
  color: string;
  opacity: number;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
  mass: number; // ambient particles are lighter and fly further
};

const round = (n: number) => Math.round(n * 100) / 100;

function buildField(): Particle[] {
  const rand = mulberry32(7);
  const particles: Particle[] = [];
  const make = (x: number, y: number, ambient: boolean): Particle => ({
    x: round(x),
    y: round(y),
    size: round(ambient ? 3 + rand() * 4 : 4 + rand() * 7),
    rot: round(rand() * 360),
    color: COLORS[Math.floor(rand() * COLORS.length)],
    opacity: round(ambient ? 0.2 + rand() * 0.25 : 0.55 + rand() * 0.45),
    dx: round((rand() - 0.5) * 14),
    dy: round((rand() - 0.5) * 14),
    duration: round(4 + rand() * 6),
    delay: round(rand() * 1.2),
    mass: round(ambient ? 0.6 : 0.8 + rand() * 0.6),
  });

  // Brain-like cloud: two overlapping lobes plus a stem, denser toward each centre.
  const lobes = [
    { cx: 250, cy: 270, rx: 150, ry: 125, n: 120 },
    { cx: 360, cy: 255, rx: 135, ry: 115, n: 105 },
    { cx: 310, cy: 385, rx: 55, ry: 45, n: 25 },
  ];
  for (const l of lobes) {
    for (let i = 0; i < l.n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (0.75 + rand() * 0.25);
      particles.push(make(l.cx + Math.cos(a) * l.rx * r, l.cy + Math.sin(a) * l.ry * r, false));
    }
  }
  // Ambient scatter across the whole canvas.
  for (let i = 0; i < 60; i++) particles.push(make(rand() * 600, rand() * 600, true));
  return particles;
}

const FIELD = buildField();

function triangle(size: number) {
  const h = size * 0.866;
  return `0,${round(-h * 0.66)} ${round(size / 2)},${round(h * 0.33)} ${round(-size / 2)},${round(h * 0.33)}`;
}

// Field strength: 0 = at rest, 1 = pointer hovering, >1 = click shockwave.
const RADIUS = 95; // viewBox units
const PUSH = 42;

type Field = { px: MotionValue<number>; py: MotionValue<number>; power: MotionValue<number> };

function displacement(p: Particle, px: number, py: number, power: number) {
  const dx = p.x - px;
  const dy = p.y - py;
  const dist = Math.hypot(dx, dy) || 1;
  const radius = RADIUS * Math.max(1, power);
  if (power <= 0.001 || dist > radius) return [0, 0];
  const falloff = (1 - dist / radius) ** 2;
  const push = (PUSH * power * falloff) / p.mass;
  return [(dx / dist) * push, (dy / dist) * push];
}

function Triangle({ p, field, reduce }: { p: Particle; field: Field | null; reduce: boolean }) {
  const zero = useMotionValue(0);
  // One field is shared by every particle; each derives only its own offset.
  const inputs = field ? [field.px, field.py, field.power] : [zero, zero, zero];
  const x = useTransform(inputs, ([px, py, pw]: number[]) => displacement(p, px, py, pw)[0]);
  const y = useTransform(inputs, ([px, py, pw]: number[]) => displacement(p, px, py, pw)[1]);

  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <motion.g style={{ x, y }}>
        <g transform={`rotate(${p.rot})`}>
          <motion.polygon
            points={triangle(p.size)}
            fill="none"
            stroke={p.color}
            strokeWidth={1.2}
            initial={reduce ? false : { scale: 0 }}
            animate={
              reduce
                ? { opacity: p.opacity }
                : {
                    opacity: [p.opacity, round(p.opacity * 0.35)],
                    scale: 1,
                    x: [0, p.dx, 0],
                    y: [0, p.dy, 0],
                  }
            }
            transition={{
              scale: { duration: 0.8, delay: p.delay, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: p.duration / 2, delay: p.delay, repeat: Infinity, repeatType: "mirror" },
              x: { duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" },
              y: { duration: p.duration * 1.3, delay: p.delay, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        </g>
      </motion.g>
    </g>
  );
}

export function Constellation({ className }: { className?: string }) {
  const reduce = !!useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);

  // Raw pointer in viewBox units, smoothed by springs so particles glide rather than snap.
  const rawX = useMotionValue(300);
  const rawY = useMotionValue(300);
  const px = useSpring(rawX, { stiffness: 260, damping: 28 });
  const py = useSpring(rawY, { stiffness: 260, damping: 28 });
  const power = useMotionValue(0);

  // Whole-cloud tilt toward the pointer.
  const tiltX = useSpring(useTransform(rawY, [0, 600], [7, -7]), { stiffness: 120, damping: 20 });
  const tiltY = useSpring(useTransform(rawX, [0, 600], [-9, 9]), { stiffness: 120, damping: 20 });

  function toViewBox(e: React.PointerEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 600, ((e.clientY - r.top) / r.height) * 600];
  }

  function onMove(e: React.PointerEvent) {
    const [x, y] = toViewBox(e);
    rawX.set(x);
    rawY.set(y);
    if (power.get() < 1 && !power.isAnimating()) animate(power, 1, { duration: 0.4 });
  }

  function onEnter(e: React.PointerEvent) {
    // Jump the smoothed pointer to the entry point so it doesn't sweep across the cloud.
    const [x, y] = toViewBox(e);
    rawX.jump(x);
    rawY.jump(y);
    px.jump(x);
    py.jump(y);
  }

  function onLeave() {
    animate(power, 0, { duration: 0.8, ease: "easeOut" });
    rawX.set(300);
    rawY.set(300);
  }

  function onDown(e: React.PointerEvent) {
    onEnter(e);
    // Shockwave: spike outward, then spring back to the hover field.
    animate(power, [power.get(), 3.2, 1], { duration: 1.1, times: [0, 0.18, 1], ease: ["easeOut", "easeInOut"] });
  }

  const field = reduce ? null : { px, py, power };

  return (
    <div className={className} style={{ perspective: 1200 }}>
      <motion.svg
        ref={svgRef}
        viewBox="0 0 600 600"
        className="block w-full touch-pan-y select-none"
        style={reduce ? undefined : { rotateX: tiltX, rotateY: tiltY, cursor: "crosshair" }}
        onPointerEnter={reduce ? undefined : onEnter}
        onPointerMove={reduce ? undefined : onMove}
        onPointerLeave={reduce ? undefined : onLeave}
        onPointerDown={reduce ? undefined : onDown}
        aria-hidden="true"
      >
        {FIELD.map((p, i) => (
          <Triangle key={i} p={p} field={field} reduce={reduce} />
        ))}
      </motion.svg>
    </div>
  );
}
