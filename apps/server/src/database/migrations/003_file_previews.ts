import { Kysely } from 'kysely';

/** Cada arquivo original pode ter um PDF de visualização fiel ao layout (gerado pelo Gotenberg). */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('files')
    .addColumn('preview_file_id', 'uuid', (c) => c.references('files.id').onDelete('set null'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('files').dropColumn('preview_file_id').execute();
}
