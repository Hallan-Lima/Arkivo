import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, FileWarning, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, qk } from '@/lib/hooks';
import type { FileRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from './ui';
import { PdfViewer } from './PdfViewer';

const OFFICE = /\.(docx?|docm|dotx|odt|rtf|pptx?|pptm|odp|ppsx|pps|xlsx?|xlsm|ods|vsdx?|odg|pub)$/i;
const TEXT = /\.(txt|md|markdown|csv|sql|sh|bash|ps1|py|js|ts|json|ya?ml|xml|ini|conf|cfg|log|bat|cmd)$/i;

export function viewerKind(f: Pick<FileRow, 'name' | 'mime' | 'preview_file_id'>) {
  if (f.mime === 'application/pdf') return 'pdf' as const;
  if (f.preview_file_id) return 'preview' as const;
  if (f.mime.startsWith('image/')) return 'image' as const;
  if (OFFICE.test(f.name)) return 'office' as const;
  if (TEXT.test(f.name) || f.mime.startsWith('text/')) return 'text' as const;
  return 'other' as const;
}

/**
 * Mostra o arquivo original exatamente como era:
 * PDF no visualizador do navegador, Office pelo PDF gerado (Gotenberg/LibreOffice), imagens e texto puro.
 */
export function FileViewer({ file, nodeId, canEdit, className }: { file: FileRow; nodeId?: string; canEdit: boolean; className?: string }) {
  const qc = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(file.preview_file_id);
  const kind = viewerKind({ ...file, preview_file_id: previewId });
  const generate = useMutation({
    mutationFn: () => api.post<{ previewFileId: string }>(`/files/${file.id}/preview`),
    onSuccess: (r) => {
      setPreviewId(r.previewFileId);
      if (nodeId) qc.invalidateQueries({ queryKey: qk.node(nodeId) });
    },
  });
  const text = useQuery({
    queryKey: ['file-text', file.id],
    queryFn: () => fetch(`/api/files/${file.id}`, { credentials: 'include' }).then((r) => r.text()),
    enabled: kind === 'text',
  });

  const src = kind === 'preview' ? `/api/files/${previewId}` : `/api/files/${file.id}`;

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.name}</div>
          <div className="text-xs text-fg-subtle">
            {formatBytes(file.size)}
            {kind === 'preview' && ' · visualização fiel ao original (convertida para PDF)'}
          </div>
        </div>
        {(kind === 'pdf' || kind === 'preview' || kind === 'image') && (
          <a href={src} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted hover:bg-muted hover:text-fg">
            <ExternalLink className="size-4" /> Abrir em nova aba
          </a>
        )}
        <a href={`/api/files/${file.id}?download=1`} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-muted">
          <Download className="size-4" /> Baixar original
        </a>
      </div>

      <div className="min-h-0 flex-1">
        {(kind === 'pdf' || kind === 'preview') && <PdfViewer url={src} />}
        {kind === 'image' && (
          <div className="grid h-full place-items-center overflow-auto p-6">
            <img src={src} alt={file.name} className="max-w-full rounded-lg shadow" />
          </div>
        )}
        {kind === 'text' && (
          <pre className="h-full overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-relaxed">{text.isLoading ? 'Carregando…' : text.data}</pre>
        )}
        {(kind === 'office' || kind === 'other') && (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
            <FileWarning className="size-10 text-fg-subtle" />
            {kind === 'office' ? (
              <>
                <p className="max-w-md text-sm text-fg-muted">
                  Para ver este arquivo exatamente como o original, o Arkivo converte-o em PDF usando o LibreOffice (serviço <code>gotenberg</code>).
                </p>
                {canEdit && (
                  <Button onClick={() => generate.mutate()} loading={generate.isPending}>
                    {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Gerar visualização
                  </Button>
                )}
                {generate.error && <p className="max-w-md text-sm text-red-600">{(generate.error as Error).message}</p>}
              </>
            ) : (
              <p className="max-w-md text-sm text-fg-muted">O navegador não consegue exibir este tipo de arquivo. Baixe o original para abri-lo.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
