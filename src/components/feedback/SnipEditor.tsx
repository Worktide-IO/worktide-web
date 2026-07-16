import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop, Highlighter, Loader2, Square, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

type Tool = 'crop' | 'highlight' | 'blackout';
type Rect = { x: number; y: number; w: number; h: number };
type Annotation = { tool: 'highlight' | 'blackout' } & Rect;

/**
 * Full-screen snip editor: the reporter drags a rectangle to CROP the region,
 * HIGHLIGHTs the bug, or BLACKs OUT sensitive areas (destructive — the pixels
 * are painted over before upload). Produces a PNG Blob.
 *
 * Rects are tracked in natural-image coordinates so the composite is
 * full-resolution regardless of how the preview is scaled to fit the screen.
 */
export function SnipEditor({
  imageDataUrl,
  onDone,
  onCancel,
}: {
  imageDataUrl: string;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('crop');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const toNatural = (clientX: number, clientY: number): { x: number; y: number } => {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const scaleX = el.naturalWidth / rect.width;
    const scaleY = el.naturalHeight / rect.height;
    const x = Math.max(0, Math.min(el.naturalWidth, (clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(el.naturalHeight, (clientY - rect.top) * scaleY));
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startRef.current = toNatural(e.clientX, e.clientY);
    setDrag({ ...startRef.current, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const p = toNatural(e.clientX, e.clientY);
    const s = startRef.current;
    setDrag({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };

  const onPointerUp = () => {
    const r = drag;
    startRef.current = null;
    setDrag(null);
    if (!r || r.w < 4 || r.h < 4) return;
    if (tool === 'crop') setCrop(r);
    else setAnnotations((prev) => [...prev, { tool, ...r }]);
  };

  // Scale a natural rect to the preview element's CSS box for the overlay.
  const toDisplay = (r: Rect): React.CSSProperties => {
    const el = imgRef.current;
    if (!el) return { display: 'none' };
    const rect = el.getBoundingClientRect();
    const sx = rect.width / el.naturalWidth;
    const sy = rect.height / el.naturalHeight;
    return { left: r.x * sx, top: r.y * sy, width: r.w * sx, height: r.h * sy };
  };

  const compose = async () => {
    setBusy(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
        img.src = imageDataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);

      for (const a of annotations.filter((x) => x.tool === 'highlight')) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.fillRect(a.x, a.y, a.w, a.h);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3;
        ctx.strokeRect(a.x, a.y, a.w, a.h);
      }
      // Blackout is destructive — painted opaque so redacted pixels are gone.
      for (const a of annotations.filter((x) => x.tool === 'blackout')) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(a.x, a.y, a.w, a.h);
      }

      let out: HTMLCanvasElement = canvas;
      if (crop && crop.w > 4 && crop.h > 4) {
        const c2 = document.createElement('canvas');
        c2.width = Math.round(crop.w);
        c2.height = Math.round(crop.h);
        const cx = c2.getContext('2d');
        if (!cx) throw new Error('no 2d context');
        cx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, c2.width, c2.height);
        out = c2;
      }

      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      if (blob) onDone(blob);
      else onCancel();
    } catch {
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const tools: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: 'crop', icon: Crop, label: t('feedback.snip.crop') },
    { id: 'highlight', icon: Highlighter, label: t('feedback.snip.highlight') },
    { id: 'blackout', icon: Square, label: t('feedback.snip.blackout') },
  ];

  return (
    <div data-feedback-chrome="true" className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/10 bg-neutral-900/90 px-4 py-2 text-white">
        <div className="flex items-center gap-1">
          {tools.map((tl) => (
            <Button
              key={tl.id}
              type="button"
              size="sm"
              variant={tool === tl.id ? 'default' : 'ghost'}
              className={tool === tl.id ? '' : 'text-white hover:bg-white/10 hover:text-white'}
              onClick={() => setTool(tl.id)}
            >
              <tl.icon className="size-4" /> {tl.label}
            </Button>
          ))}
        </div>
        <span className="ml-2 text-xs text-white/60">{t('feedback.snip.hint')}</span>
        <div className="ml-auto flex items-center gap-2">
          {(crop || annotations.length > 0) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                setCrop(null);
                setAnnotations([]);
              }}
            >
              {t('feedback.snip.reset')}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={onCancel}>
            <X className="size-4" /> {t('action.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={compose} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('feedback.snip.attach')}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <div
          className="relative touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt=""
            draggable={false}
            className="max-h-[80vh] max-w-full cursor-crosshair rounded shadow-2xl"
          />
          {annotations.map((a, i) => (
            <div
              key={i}
              className={
                a.tool === 'highlight'
                  ? 'pointer-events-none absolute border-2 border-yellow-400 bg-yellow-300/30'
                  : 'pointer-events-none absolute bg-black'
              }
              style={toDisplay(a)}
            />
          ))}
          {crop && (
            <div className="pointer-events-none absolute border-2 border-dashed border-sky-400 bg-sky-400/10" style={toDisplay(crop)} />
          )}
          {drag && (
            <div
              className={
                tool === 'blackout'
                  ? 'pointer-events-none absolute bg-black/80'
                  : tool === 'highlight'
                    ? 'pointer-events-none absolute border-2 border-yellow-400 bg-yellow-300/30'
                    : 'pointer-events-none absolute border-2 border-dashed border-sky-400 bg-sky-400/10'
              }
              style={toDisplay(drag)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
