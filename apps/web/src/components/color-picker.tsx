'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* Conversões HSV ↔ HEX. Guardamos HSV no estado (e não o hex) porque só assim o
   matiz sobrevive quando o usuário arrasta até o preto ou o branco, onde vários
   matizes produzem o mesmo hex. */

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

interface Hsv {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const channel = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function hexToHsv(hex: string): Hsv | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** Arrasto contínuo dentro de um elemento, normalizado em 0–1 nos dois eixos. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef(onMove);
  handler.current = onMove;

  const emit = useCallback((clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    handler.current(
      clamp01((clientX - rect.left) / rect.width),
      clamp01((clientY - rect.top) / rect.height),
    );
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      ref.current?.focus();
      emit(event.clientX, event.clientY);

      const move = (e: PointerEvent) => emit(e.clientX, e.clientY);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [emit],
  );

  return { ref, onPointerDown };
}

/**
 * Seletor de cor com o espectro completo: área de saturação/brilho, barra de
 * matiz e campo hex. Substitui a antiga paleta fixa de cores.
 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 24, s: 0.94, v: 0.96 });
  const [hexInput, setHexInput] = useState(value);
  // Último hex que este componente emitiu: sem isso o efeito de sincronia
  // reescreveria o HSV a cada arrasto e o matiz "pularia" no preto/branco.
  const emitted = useRef(value);

  useEffect(() => {
    if (value.toLowerCase() === emitted.current.toLowerCase()) return;
    emitted.current = value;
    setHexInput(value);
    const parsed = hexToHsv(value);
    if (parsed) setHsv(parsed);
  }, [value]);

  const apply = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      emitted.current = hex;
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  const area = useDrag((x, y) => apply({ ...hsv, s: x, v: 1 - y }));
  const hueBar = useDrag((x) => apply({ ...hsv, h: x * 360 }));

  function handleHexInput(raw: string) {
    setHexInput(raw);
    const parsed = hexToHsv(raw);
    if (!parsed) return;
    const hex = hsvToHex(parsed);
    emitted.current = hex;
    setHsv(parsed);
    onChange(hex);
  }

  function nudge(event: React.KeyboardEvent, axis: 'sv' | 'hue') {
    const step = event.shiftKey ? 0.1 : 0.02;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    if (axis === 'hue') {
      apply({ ...hsv, h: (hsv.h + delta[0] * step * 360 + 360) % 360 });
      return;
    }
    apply({
      ...hsv,
      s: clamp01(hsv.s + delta[0] * step),
      v: clamp01(hsv.v + delta[1] * step),
    });
  }

  const current = hsvToHex(hsv);

  return (
    <div className="space-y-3">
      <div
        ref={area.ref}
        role="slider"
        aria-label="Saturação e brilho"
        aria-valuetext={`Saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
        tabIndex={0}
        onPointerDown={area.onPointerDown}
        onKeyDown={(event) => nudge(event, 'sv')}
        className="relative h-40 w-full cursor-crosshair touch-none rounded-lg border border-slate-200 outline-none ring-brand focus-visible:ring-2"
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
      >
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black to-transparent" />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: current,
          }}
        />
      </div>

      <div
        ref={hueBar.ref}
        role="slider"
        aria-label="Matiz"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onPointerDown={hueBar.onPointerDown}
        onKeyDown={(event) => nudge(event, 'hue')}
        className="relative h-4 w-full cursor-pointer touch-none rounded-full border border-slate-200 outline-none ring-brand focus-visible:ring-2"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
      >
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span
          className="h-9 w-9 shrink-0 rounded-lg border border-slate-200"
          style={{ backgroundColor: current }}
        />
        <input
          value={hexInput}
          onChange={(event) => handleHexInput(event.target.value)}
          onBlur={() => setHexInput(current)}
          aria-label="Código hexadecimal da cor"
          spellCheck={false}
          maxLength={7}
          className="w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
    </div>
  );
}
