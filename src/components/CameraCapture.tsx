import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type FacingMode = 'environment' | 'user';

export function CameraCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (mode: FacingMode) => {
    stopStream();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError('לא ניתן לגשת למצלמה. אנא אפשר גישה למצלמה בהגדרות הדפדפן.');
    }
  }, [stopStream]);

  // Start stream when overlay opens; stop when it closes.
  useEffect(() => {
    if (open && !preview) {
      void startStream(facingMode);
    }
    if (!open) {
      stopStream();
      setPreview(null);
      setError(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-start stream when facingMode changes (only when live, not in preview).
  useEffect(() => {
    if (open && !preview) {
      void startStream(facingMode);
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach stream to video element after ref is available.
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  });

  // Cleanup on unmount.
  useEffect(() => () => { stopStream(); }, [stopStream]);

  const handleSnap = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopStream();
    setPreview(dataUrl);
  }, [stopStream]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    void startStream(facingMode);
  }, [facingMode, startStream]);

  const handleConfirm = useCallback(() => {
    if (!preview) return;
    const byteString = atob(preview.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/jpeg' });
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    onClose();
  }, [preview, onCapture, onClose]);

  const handleToggleFacing = useCallback(() => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  const handleClose = useCallback(() => {
    stopStream();
    setPreview(null);
    setError(null);
    onClose();
  }, [stopStream, onClose]);

  if (!open) return null;

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6 px-6"
      >
        <Camera className="text-white/40" size={48} />
        <p className="text-white text-center text-lg leading-relaxed max-w-sm">{error}</p>
        <button
          onClick={handleClose}
          className="px-6 py-2 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors"
        >
          סגור
        </button>
      </div>
    );
  }

  // ── Preview state ────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div dir="rtl" className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Preview image */}
        <img
          src={preview}
          alt="תצוגה מקדימה"
          className="flex-1 w-full object-contain"
        />

        {/* Action bar */}
        <div className="flex items-center justify-center gap-6 px-6 py-6 bg-black/80">
          {/* Retake */}
          <button
            onClick={handleRetake}
            className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 hover:border-white transition-colors">
              <RefreshCw size={22} />
            </span>
            <span className="text-xs">צלם שוב</span>
          </button>

          {/* Confirm */}
          <button
            onClick={handleConfirm}
            className="flex flex-col items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-lg">
              <Check size={28} className="text-white" />
            </span>
            <span className="text-xs">השתמש בתמונה</span>
          </button>
        </div>

        {/* Hidden canvas used for capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // ── Live viewfinder ──────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Live video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="flex-1 w-full object-cover"
      />

      {/* Hidden canvas for drawing the snapshot */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom control bar */}
      <div className="flex items-center justify-between px-8 py-6 bg-black/60">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/50 text-white hover:border-white hover:bg-white/10 transition-colors"
          aria-label="סגור"
        >
          <X size={22} />
        </button>

        {/* Snap button — centred */}
        <button
          onClick={handleSnap}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/10 hover:bg-white/20 transition-colors shadow-lg"
          aria-label="צלם תמונה"
        >
          <span className="h-16 w-16 rounded-full bg-white" />
        </button>

        {/* Toggle front/back camera */}
        <button
          onClick={handleToggleFacing}
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/50 text-white hover:border-white hover:bg-white/10 transition-colors"
          aria-label="החלף מצלמה"
        >
          <RefreshCw size={20} />
        </button>
      </div>
    </div>
  );
}
