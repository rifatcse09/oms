import { useEffect, useRef, useState } from "react";
import { Eraser, ImagePlus, Pen } from "lucide-react";

type Tab = "draw" | "upload";

export function SignatureCapture({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (dataUrl: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dprRef = useRef(1);

  const setupCanvas = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    c.width = Math.max(1, Math.floor(rect.width * dpr));
    c.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    return ctx;
  };

  useEffect(() => {
    const run = () => setupCanvas();
    run();
    window.addEventListener("resize", run);
    return () => window.removeEventListener("resize", run);
  }, [tab]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) {
      const rect = c.getBoundingClientRect();
      const dpr = dprRef.current || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
    onChange(null);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-brand-dark">Signature</h3>
          <p className="text-xs text-brand-muted">
            Draw or upload an image — required before submit (স্বাক্ষর বাধ্যতামূলক)
          </p>
        </div>
        <div className="flex rounded-full bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab("draw")}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              tab === "draw" ? "bg-white shadow text-brand-dark" : "text-brand-muted"
            }`}
          >
            <Pen className="h-3.5 w-3.5" /> Draw
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              tab === "upload" ? "bg-white shadow text-brand-dark" : "text-brand-muted"
            }`}
          >
            <ImagePlus className="h-3.5 w-3.5" /> Upload
          </button>
        </div>
      </div>

      {tab === "draw" ? (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            className="h-44 w-full max-w-full touch-none cursor-crosshair rounded-xl border border-dashed border-slate-300 bg-white md:h-48"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={(e) => {
              e.preventDefault();
              start(e);
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              move(e);
            }}
            onTouchEnd={() => end()}
          />
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:bg-slate-100">
            <ImagePlus className="mb-2 h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-brand-dark">Choose image file</span>
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        </div>
      )}

      {value ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-700">Signature saved</p>
          <img
            src={value}
            alt="Saved signature"
            className="mt-2 h-16 max-w-[220px] rounded border border-emerald-200 bg-white object-contain p-1"
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">No signature yet</p>
      )}
    </div>
  );
}
