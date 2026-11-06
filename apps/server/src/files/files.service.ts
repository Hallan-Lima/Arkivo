import { Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { isOfficeFile, officeToPdf } from './preview';

export const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), 'data', 'uploads'));

@Injectable()
export class FilesService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  async save(input: { workspaceId: string; userId: string; name: string; mime: string; data: Buffer; kind: 'original' | 'image' | 'attachment' | 'preview'; nodeId?: string | null }) {
    const ext = extname(input.name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    const key = `${input.workspaceId}/${randomUUID()}${ext}`;
    await mkdir(join(STORAGE_DIR, input.workspaceId), { recursive: true });
    await writeFile(join(STORAGE_DIR, key), input.data);
    return this.db
      .insertInto('files')
      .values({
        workspace_id: input.workspaceId,
        node_id: input.nodeId ?? null,
        kind: input.kind,
        name: input.name.slice(0, 255),
        mime: input.mime || 'application/octet-stream',
        size: input.data.length,
        storage_key: key,
        created_by: input.userId,
      })
      .returning(['id', 'name', 'mime', 'size', 'kind'])
      .executeTakeFirstOrThrow();
  }

  /** Converte o original em PDF (Gotenberg) e o liga como visualização. Retorna o PDF ou null. */
  async attachPreview(workspaceId: string, userId: string, originalId: string, name: string, data: Buffer) {
    const pdf = await officeToPdf(name, data);
    if (!pdf) return null;
    const base = name.slice(0, name.length - extname(name).length) || 'documento';
    const preview = await this.save({ workspaceId, userId, name: `${base}.pdf`, mime: 'application/pdf', data: pdf, kind: 'preview' });
    await this.db.updateTable('files').set({ preview_file_id: preview.id }).where('id', '=', originalId).execute();
    return pdf;
  }

  /** Garante que um original do Office tenha PDF de visualização (gera sob demanda para arquivos antigos). */
  async ensurePreview(workspaceId: string, userId: string, id: string) {
    const { file, data } = await this.read(workspaceId, id);
    if (file.preview_file_id) return file.preview_file_id;
    if (file.mime === 'application/pdf') return file.id;
    if (!isOfficeFile(file.name)) return null;
    if (!(await this.attachPreview(workspaceId, userId, file.id, file.name, data))) return null;
    const updated = await this.db.selectFrom('files').select('preview_file_id').where('id', '=', id).executeTakeFirstOrThrow();
    return updated.preview_file_id;
  }

  async read(workspaceId: string, id: string) {
    const file = await this.db.selectFrom('files').selectAll().where('id', '=', id).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!file) throw new NotFoundException('Arquivo não encontrado');
    const path = resolve(STORAGE_DIR, file.storage_key);
    if (!path.startsWith(STORAGE_DIR)) throw new NotFoundException();
    return { file, data: await readFile(path) };
  }
}
