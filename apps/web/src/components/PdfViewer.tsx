import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Minus, Plus } from 'lucide-react';
import { Spinner } from './ui';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Renderiza o PDF dentro do Arkivo (pdf.js), página a página e sob demanda,
 * para funcionar igual em qualquer navegador — inclusive os sem visualizador de PDF.
 */
export function PdfViewer({ url }: { url: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError('');
    const task = getDocument({ url, withCredentials: true });
    task.promise.then(
      (d) => !cancelled && setDoc(d),
      (e) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth - 48)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <div ref={container} className="min-h-0 flex-1 overflow-auto bg-zinc-200 py-6 dark:bg-zinc-900">
        {error && <p className="p-6 text-center text-sm text-red-600">Não foi possível abrir o PDF: {error}</p>}
        {!doc && !error && (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        )}
        {doc && (
          <div className="flex flex-col items-center gap-4">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i} doc={doc} pageNumber={i + 1} width={Math.min(width, 1000) * zoom} />
            ))}
          </div>
        )}
      </div>
      {doc && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-bg/95 px-2 py-1 text-xs shadow-lg backdrop-blur">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} className="grid size-7 place-items-center rounded-full hover:bg-muted" title="Diminuir zoom">
            <Minus className="size-3.5" />
          </button>
          <button onClick={() => setZoom(1)} className="w-12 text-center tabular-nums" title="Ajustar à largura">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(1)))} className="grid size-7 place-items-center rounded-full hover:bg-muted" title="Aumentar zoom">
            <Plus className="size-3.5" />
          </button>
          <span className="ml-1 border-l border-border pl-2 text-fg-subtle">{doc.numPages} pág.</span>
        </div>
      )}
    </div>
  );
}

function PdfPage({ doc, pageNumber, width }: { doc: PDFDocumentProxy; pageNumber: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [ratio, setRatio] = useState(1.414);

  // Só renderiza quando a página se aproxima da área visível (PDFs grandes continuam leves).
  useEffect(() => {
    const el = holder.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      const task = page.render({ canvas: c, viewport });
      renderTask = task;
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, width, visible]);

  return (
    <div ref={holder} className="bg-white shadow-md" style={{ width, height: width * ratio }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
