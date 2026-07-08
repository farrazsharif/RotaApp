import { useEffect, useRef } from 'react';

// A simple draw-to-sign canvas. `value` is a PNG data URL (empty = unsigned).
// In read-only mode it renders the saved signature as an image.
export default function SignaturePad({ value, ro, onChange }: { value: string; ro: boolean; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Render an existing signature onto the canvas when it loads/changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  if (ro) {
    return value
      ? <img src={value} alt="signature" className="border rounded-lg bg-white max-h-32" />
      : <p className="text-sm text-gray-400 border rounded-lg p-3 bg-gray-50">Not signed</p>;
  }

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvasRef.current!.width / r.width), y: (e.clientY - r.top) * (canvasRef.current!.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; last.current = pos(e); (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const end = () => { if (drawing.current) { drawing.current = false; onChange(canvasRef.current!.toDataURL('image/png')); } };
  const clear = () => { const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); onChange(''); };

  return (
    <div className="space-y-1">
      <canvas
        ref={canvasRef}
        width={500}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="border rounded-lg bg-white w-full touch-none cursor-crosshair"
        style={{ maxWidth: 500 }}
      />
      <button type="button" onClick={clear} className="text-xs text-blue-600 hover:underline">Clear signature</button>
    </div>
  );
}
