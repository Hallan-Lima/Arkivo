import { extname } from 'node:path';
import { Logger } from '@nestjs/common';

const log = new Logger('Preview');

/** Formatos que o LibreOffice (via Gotenberg) converte em PDF mantendo o layout. */
export const OFFICE_EXTENSIONS = [
  '.docx', '.doc', '.docm', '.dotx', '.odt', '.rtf',
  '.pptx', '.ppt', '.pptm', '.odp', '.ppsx', '.pps',
  '.xlsx', '.xls', '.xlsm', '.ods',
  '.vsdx', '.vsd', '.odg', '.pub',
];

export const isOfficeFile = (name: string) => OFFICE_EXTENSIONS.includes(extname(name).toLowerCase());

const gotenbergUrl = () => (process.env.GOTENBERG_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

/**
 * Converte um arquivo do Office em PDF usando o Gotenberg (LibreOffice).
 * Retorna null se o serviço não estiver disponível — a importação continua funcionando sem a prévia.
 */
export async function officeToPdf(name: string, data: Buffer): Promise<Buffer | null> {
  if (process.env.GOTENBERG_URL === '') return null; // desabilitado explicitamente
  const form = new FormData();
  // O LibreOffice usa a extensão para escolher o filtro de importação.
  const safeName = `documento${extname(name).toLowerCase()}`;
  form.append('files', new Blob([new Uint8Array(data)]), safeName);
  try {
    const res = await fetch(`${gotenbergUrl()}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      log.warn(`Gotenberg respondeu ${res.status} para ${name}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    log.warn(`Gotenberg indisponível (${gotenbergUrl()}): ${(e as Error).message}`);
    return null;
  }
}
