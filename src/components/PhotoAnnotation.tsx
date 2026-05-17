import { useRef, useState, useEffect, useCallback } from 'react';
import { Pen, Eraser, Trash2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  onSave: (annotatedBlob: Blob) => void;
}

const COLOR_SWATCHES = [
  { value: '#ef4444', label: 'אדום' },
  { value: '#fbbf24', label: 'צהוב' },
  { value: '#ffffff', label: 'לבן' },
  { value: '#3b82f6', label: 'כחול' },
  { value: '#111827', label: 'שחור' },
];

const LINE_WIDTHS = [2, 4, 8];

export function PhotoAnnotation({ open, imageUrl, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);

  // Clear canvas when closed
  useEffect(() => {
    if (!open) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      setTool('pen');
      setColor('#ef4444');
      setLineWidth(4);
      setDrawing(false);
      setLastPos(null);
    }
  }, [open]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }, []);

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Scale from display size to canvas internal resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getCanvasPos(e);
    setDrawing(true);
    setLastPos(pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !lastPos) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasPos(e);

    ctx.save();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = lineWidth * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();

    setLastPos(pos);
  };

  const handlePointerUp = () => {
    setDrawing(false);
    setLastPos(null);
  };

  const handleClearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(img, 0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob(blob => {
      if (blob) {
        onSave(blob);
        onClose();
      }
    }, 'image/jpeg', 0.92);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" dir="rtl">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black/90 border-b border-white/10 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="סגור"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="flex-1 text-center text-white text-sm font-medium">ציור על תמונה</span>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSave}
        >
          <Check className="h-4 w-4" />
          שמור
        </Button>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center min-h-0">
        {/* Hidden source image — used only for drawing onto the output canvas */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          className="max-w-full max-h-full object-contain select-none pointer-events-none absolute inset-0 w-full h-full"
          onLoad={handleImageLoad}
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex-shrink-0 bg-black/90 border-t border-white/10 px-3 py-2 flex flex-wrap items-center gap-3">
        {/* Tool toggle */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`p-2 rounded-md transition-colors ${tool === 'pen' ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            aria-label="עט"
          >
            <Pen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-md transition-colors ${tool === 'eraser' ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            aria-label="מחק"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </div>

        <div className="w-px h-6 bg-white/20 flex-shrink-0" />

        {/* Color swatches */}
        <div className="flex gap-1.5">
          {COLOR_SWATCHES.map(swatch => (
            <button
              key={swatch.value}
              type="button"
              onClick={() => { setColor(swatch.value); setTool('pen'); }}
              aria-label={swatch.label}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${color === swatch.value && tool === 'pen' ? 'border-white scale-110' : 'border-white/40 hover:scale-105'}`}
              style={{ backgroundColor: swatch.value }}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-white/20 flex-shrink-0" />

        {/* Line width */}
        <div className="flex gap-1">
          {LINE_WIDTHS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setLineWidth(w)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${lineWidth === w ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-white/20 flex-shrink-0" />

        {/* Clear */}
        <button
          type="button"
          onClick={handleClearAll}
          className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="נקה הכל"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {/* Save — also in bottom bar for discoverability on mobile */}
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleSave}
        >
          <Check className="h-4 w-4" />
          שמור
        </Button>
      </div>
    </div>
  );
}
