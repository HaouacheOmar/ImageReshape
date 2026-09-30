"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const OPS = [
  { id: "crop", label: "Crop" },
  { id: "resize", label: "Resize" },
  { id: "remove", label: "Remove background" },
] as const;
type Op = (typeof OPS)[number]["id"];

type Source = { file: File; url: string; w: number; h: number };

const EASE = [0.16, 1, 0.3, 1] as const;

function loadSource(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ file, url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a readable image."));
    };
    img.src = url;
  });
}

type Edge = "e" | "s" | "se";

// Hit area (full edge / corner) + the visible violet grip inside it.
const HANDLES: { edge: Edge; area: string; grip: string }[] = [
  { edge: "e", area: "right-0 top-0 h-full w-[20px] cursor-ew-resize", grip: "right-[7px] top-1/2 -translate-y-1/2 h-[36px] w-[6px]" },
  { edge: "s", area: "bottom-0 left-0 h-[20px] w-full cursor-ns-resize", grip: "bottom-[7px] left-1/2 -translate-x-1/2 h-[6px] w-[36px]" },
  { edge: "se", area: "bottom-0 right-0 size-[32px] cursor-nwse-resize", grip: "bottom-[9px] right-[9px] size-[12px]" },
];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n) || 0));

export function Editor() {
  const reduce = useReducedMotion();
  const [source, setSource] = useState<Source | null>(null);
  const [op, setOp] = useState<Op>("crop");
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lockRatio, setLockRatio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [view, setView] = useState<"original" | "result">("original");
  const [dragging, setDragging] = useState(false);
  const [drawFrom, setDrawFrom] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{ edge: Edge; x0: number; y0: number; w0: number; h0: number } | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  // One hidden input for every "choose a file" trigger, opened explicitly (no label/input nesting).
  const fileRef = useRef<HTMLInputElement>(null);
  const openPicker = () => fileRef.current?.click();

  // Back to the empty drop zone; the source's object URL is revoked by the effect below.
  function reset() {
    setSource(null);
    setResultUrl(null);
    setView("original");
    setError(null);
    setResizing(null);
    setDrawFrom(null);
  }
  const [room, setRoom] = useState({ w: 800, h: 600 });

  // Space the resize frame may grow into: the stage column's width, and most of the viewport's height.
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth, h: window.innerHeight * 0.85 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const s = await loadSource(file);
      setSource(s);
      setCrop({ x: 0, y: 0, w: s.w, h: s.h });
      setSize({ width: s.w, height: s.h });
      setResultUrl(null);
      setView("original");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function apply() {
    if (!source) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("image", source.file);
    const params: Record<string, number> =
      op === "crop" ? crop : op === "resize" ? size : {};
    for (const [k, v] of Object.entries(params)) body.append(k, String(v));
    try {
      const res = await fetch(`${API_URL}/api/${op}/`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setResultUrl(data.image_url);
      setView("result");
    } catch (e) {
      setError(e instanceof TypeError ? `Can't reach the API at ${API_URL}.` : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchResult() {
    const res = await fetch(resultUrl!);
    if (!res.ok) throw new Error("Couldn't fetch the result.");
    return res.blob();
  }

  async function download() {
    try {
      const blob = await fetchResult();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = resultUrl!.split("/").pop() ?? "image";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function keepEditing() {
    try {
      const blob = await fetchResult();
      const name = resultUrl!.split("/").pop() ?? "image";
      await pick(new File([blob], name, { type: blob.type }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setResize(key: "width" | "height", value: number) {
    if (!source) return;
    const v = clamp(value, 1, 10000);
    if (!lockRatio) return setSize((s) => ({ ...s, [key]: v }));
    const ratio = source.w / source.h;
    setSize(key === "width" ? { width: v, height: clamp(v / ratio, 1, 10000) } : { width: clamp(v * ratio, 1, 10000), height: v });
  }

  function setCropField(key: keyof typeof crop, value: number) {
    if (!source) return;
    setCrop((c) => {
      const next = { ...c, [key]: value };
      next.x = clamp(next.x, 0, source.w - 1);
      next.y = clamp(next.y, 0, source.h - 1);
      next.w = clamp(next.w, 1, source.w - next.x);
      next.h = clamp(next.h, 1, source.h - next.y);
      return next;
    });
  }

  const canDraw = !!source && op === "crop" && view === "original" && !busy;

  // Pointer position -> source-image pixels, clamped to the image.
  function toImage(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * source!.w, 0, source!.w),
      y: clamp(((e.clientY - r.top) / r.height) * source!.h, 0, source!.h),
    };
  }

  function startDraw(e: React.PointerEvent<HTMLElement>) {
    if (!canDraw || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = toImage(e);
    setDrawFrom(from);
    setCrop({ x: from.x, y: from.y, w: 1, h: 1 });
  }

  function moveDraw(e: React.PointerEvent<HTMLElement>) {
    if (!drawFrom) return;
    const to = toImage(e);
    setCrop({
      x: Math.min(drawFrom.x, to.x),
      y: Math.min(drawFrom.y, to.y),
      w: Math.max(1, Math.abs(to.x - drawFrom.x)),
      h: Math.max(1, Math.abs(to.y - drawFrom.y)),
    });
  }

  function endDraw() {
    if (!drawFrom) return;
    setDrawFrom(null);
    // A click without a drag leaves a 1px box; treat it as "select everything" instead.
    setCrop((c) => (c.w < 4 || c.h < 4 ? { x: 0, y: 0, w: source!.w, h: source!.h } : c));
  }

  const canResize = !!source && op === "resize" && view === "original" && !busy;
  // Screen px per image px. The original sits at 80% of the room, leaving space to drag it larger.
  const k = source ? Math.min(1, (room.w * 0.8) / source.w, (room.h * 0.8) / source.h) : 1;

  function startResize(edge: Edge, e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing({ edge, x0: e.clientX, y0: e.clientY, w0: size.width, h0: size.height });
  }

  function moveResize(e: React.PointerEvent<HTMLElement>) {
    if (!resizing || !source) return;
    const { edge, x0, y0, w0, h0 } = resizing;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    const maxW = room.w / k;
    const maxH = room.h / k;
    const minPx = 24 / k; // never let the frame collapse under the pointer
    let w = edge === "s" ? w0 : w0 + dx / k;
    let h = edge === "e" ? h0 : h0 + dy / k;
    if (lockRatio) {
      const ratio = source.w / source.h;
      // Follow the axis being dragged; the corner follows whichever moved more.
      if (edge === "e" || (edge === "se" && Math.abs(dx) >= Math.abs(dy))) h = w / ratio;
      else w = h * ratio;
      const fit = Math.min(1, maxW / w, maxH / h);
      const grow = Math.max(1, minPx / w, minPx / h);
      w *= fit * grow;
      h *= fit * grow;
    } else {
      w = Math.min(maxW, Math.max(minPx, w));
      h = Math.min(maxH, Math.max(minPx, h));
    }
    setSize({ width: clamp(w, 1, 10000), height: clamp(h, 1, 10000) });
  }

  const hint = canDraw
    ? "Drag across the image to draw the crop."
    : canResize
      ? "Drag the right edge, bottom edge or corner to resize."
      : null;
  const sizeSpring = reduce || resizing ? { duration: 0 } : { type: "spring" as const, stiffness: 400, damping: 40 };

  const shown = view === "result" && resultUrl ? resultUrl : source?.url;
  const fade = reduce ? { duration: 0 } : { duration: 0.5, ease: EASE };

  return (
    <section id="editor" className="mx-auto grid max-w-[1280px] gap-60 px-24 py-120 lg:grid-cols-[1.3fr_1fr]">
      {/* Stage */}
      <div ref={columnRef} className="min-w-0">
        <p className="mb-18 text-nav-label font-semibold uppercase tracking-nav-label text-saffron-spark">
          {!source
            ? "01 — Upload"
            : canResize
              ? `${source.w} × ${source.h} → ${size.width} × ${size.height}px`
              : `${source.w} × ${source.h}px`}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          // Reset so picking the same file twice still fires onChange.
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
        />
        <AnimatePresence mode="wait" initial={false}>
          {!source ? (
            <motion.div
              key="drop"
              onClick={openPicker}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={fade}
              className="group flex min-h-[420px] cursor-pointer flex-col justify-center"
            >
              <motion.span
                animate={{ color: dragging ? "#ffb829" : "#ffffff", x: dragging ? 12 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="block text-heading-sm leading-heading-sm tracking-heading-sm font-normal md:text-heading-lg md:leading-heading-lg md:tracking-heading-lg"
              >
                {dragging ? "Let it go." : "Drop an image here."}
              </motion.span>
              <span className="mt-18 text-body leading-body text-ash-gray transition-colors group-hover:text-bone-white">
                or{" "}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openPicker(); }}
                  className="text-saffron-spark underline underline-offset-4 hover:text-bone-white"
                >
                  browse your files
                </button>{" "}
                — JPG, PNG, WebP
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="stage"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={fade}
            >
              {/* Pulse lives on the wrapper so the keyed img's exit is never infinite. */}
              <motion.div
                className={`relative inline-block max-w-full touch-none overflow-hidden rounded-3xl ${canDraw ? "cursor-crosshair" : ""} ${canResize ? "outline outline-1 outline-electric-iris" : ""}`}
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerCancel={endDraw}
                initial={false}
                animate={{
                  opacity: busy && !reduce ? [1, 0.45, 1] : 1,
                  // In resize mode the wrapper *is* the frame: its size previews the output size.
                  width: canResize ? Math.min(size.width * k, room.w) : "auto",
                  height: canResize ? Math.min(size.height * k, room.h) : "auto",
                }}
                transition={{
                  opacity: busy ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 },
                  width: sizeSpring,
                  height: sizeSpring,
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.img
                    key={shown}
                    src={shown}
                    alt={view === "result" ? "Processed image" : "Original image"}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={fade}
                    draggable={false}
                    className={`block select-none rounded-3xl ${canResize ? "size-full object-fill" : "max-h-[70vh] max-w-full"}`}
                  />
                </AnimatePresence>
                {op === "crop" && view === "original" && (
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-sm outline outline-1 outline-electric-iris"
                    style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)" }}
                    initial={false}
                    animate={{
                      left: `${(crop.x / source.w) * 100}%`,
                      top: `${(crop.y / source.h) * 100}%`,
                      width: `${(crop.w / source.w) * 100}%`,
                      height: `${(crop.h / source.h) * 100}%`,
                    }}
                    // Follow the pointer 1:1 while drawing; spring when numbers are typed.
                    transition={reduce || drawFrom ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 40 }}
                  />
                )}
                {canResize &&
                  HANDLES.map(({ edge, area, grip }) => (
                    <motion.div
                      key={edge}
                      aria-hidden="true"
                      className={`absolute z-10 ${area}`}
                      onPointerDown={(e) => startResize(edge, e)}
                      onPointerMove={moveResize}
                      onPointerUp={() => setResizing(null)}
                      onPointerCancel={() => setResizing(null)}
                      initial="rest"
                      animate={resizing?.edge === edge ? "hot" : "rest"}
                      whileHover="hot"
                    >
                      <motion.span
                        className={`absolute rounded-full bg-electric-iris ${grip}`}
                        variants={{ rest: { scale: 1, opacity: 0.85 }, hot: { scale: 1.35, opacity: 1 } }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </motion.div>
                  ))}
              </motion.div>

              <AnimatePresence initial={false} mode="wait">
                {hint && (
                  <motion.p
                    key={hint}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-12 overflow-hidden text-caption leading-caption text-ash-gray"
                  >
                    {hint}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="mt-24 flex flex-wrap items-start gap-x-30 gap-y-12 text-nav-label font-semibold uppercase tracking-nav-label">
                {resultUrl && (
                  <div className="flex gap-24" role="tablist" aria-label="Compare">
                    {(["original", "result"] as const).map((v) => (
                      <GhostTab key={v} active={view === v} onClick={() => setView(v)} layoutId="view-dot">
                        {v}
                      </GhostTab>
                    ))}
                  </div>
                )}
                {resultUrl && (
                  <>
                    <button onClick={download} className="uppercase text-saffron-spark hover:text-bone-white">Download</button>
                    <button onClick={keepEditing} className="uppercase text-ash-gray hover:text-bone-white">Keep editing result</button>
                  </>
                )}
                <button type="button" onClick={reset} className="uppercase text-ash-gray hover:text-bone-white">
                  New image
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-36">
        <div>
          <p className="mb-18 text-nav-label font-semibold uppercase tracking-nav-label text-saffron-spark">02 — Reshape</p>
          <div className="flex flex-wrap gap-x-30 gap-y-18 text-nav-label font-semibold uppercase tracking-nav-label" role="tablist" aria-label="Operation">
            {OPS.map((o) => (
              <GhostTab key={o.id} active={op === o.id} onClick={() => setOp(o.id)} layoutId="op-dot">
                {o.label}
              </GhostTab>
            ))}
          </div>
        </div>

        <div className="min-h-[190px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={op}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }}
            >
              {op === "crop" && (
                <div className="grid grid-cols-2 gap-x-30 gap-y-24">
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <NumberField key={k} label={{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]} value={crop[k]} disabled={!source} onChange={(v) => setCropField(k, v)} />
                  ))}
                </div>
              )}
              {op === "resize" && (
                <div className="flex flex-col gap-24">
                  <div className="grid grid-cols-2 gap-x-30">
                    <NumberField label="Width" value={size.width} disabled={!source} onChange={(v) => setResize("width", v)} />
                    <NumberField label="Height" value={size.height} disabled={!source} onChange={(v) => setResize("height", v)} />
                  </div>
                  <button
                    onClick={() => setLockRatio((l) => !l)}
                    aria-pressed={lockRatio}
                    className="self-start text-nav-label font-semibold uppercase tracking-nav-label text-ash-gray hover:text-bone-white"
                  >
                    Aspect ratio · <span className={lockRatio ? "text-saffron-spark" : ""}>{lockRatio ? "locked" : "free"}</span>
                  </button>
                </div>
              )}
              {op === "remove" && (
                <p className="max-w-[420px] text-body leading-body text-silver-mist">
                  Separates the subject from its background and returns a transparent PNG. Works best when the subject sits near the centre.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-start gap-18">
          <motion.button
            onClick={apply}
            disabled={!source || busy}
            whileHover={source && !busy && !reduce ? { scale: 1.03 } : undefined}
            whileTap={source && !busy && !reduce ? { scale: 0.97 } : undefined}
            className="rounded-[22.5px] bg-electric-iris px-[16px] py-[14.4px] text-nav-label font-semibold uppercase tracking-nav-label text-bone-white disabled:opacity-40"
          >
            {busy ? "Processing…" : "Apply"}
          </motion.button>
          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-body leading-body text-saffron-spark"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function GhostTab({ active, onClick, layoutId, children }: { active: boolean; onClick: () => void; layoutId: string; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick} className={`relative pb-12 uppercase transition-colors ${active ? "text-bone-white" : "text-ash-gray hover:text-bone-white"}`}>
      {children}
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute bottom-0 left-1/2 size-[8px] -translate-x-1/2 rounded-full bg-electric-iris"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}

function NumberField({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-6">
      <span className="text-caption leading-caption uppercase text-ash-gray">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={disabled ? "" : value}
        placeholder="—"
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full border-b border-ash-gray/40 bg-transparent pb-6 text-heading-xs leading-heading-xs font-normal text-bone-white outline-none transition-colors focus:border-saffron-spark disabled:text-ash-gray"
      />
    </label>
  );
}
