import { Kysely, sql } from 'kysely';

/**
 * Notebook de IA (estilo NotebookLM):
 * - `node_chunks`: trechos de cada documento, com busca full-text e embedding (pgvector) para busca híbrida.
 * - `nodes.ai_usage`: flag fixa por documento (auto | always | never).
 * - `nodes.indexed_at`: controla a reindexação em segundo plano.
 * - `node_sources`: de quais documentos (e versões) um documento foi gerado — base do "fonte mudou, revise".
 * - `doc_designs`: modelos visuais de documentos (paleta, fontes, layout, logo, capa, diretrizes de conteúdo).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('nodes')
    .addColumn('ai_usage', 'text', (c) => c.notNull().defaultTo('auto'))
    .addColumn('indexed_at', 'timestamptz')
    .execute();

  await db.schema
    .createTable('node_chunks')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('node_id', 'uuid', (c) => c.notNull().references('nodes.id').onDelete('cascade'))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('idx', 'integer', (c) => c.notNull())
    .addColumn('heading', 'text')
    .addColumn('content', 'text', (c) => c.notNull())
    .addColumn('version', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('embedding', sql`vector`)
    .addColumn('embedding_model', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    ALTER TABLE node_chunks ADD COLUMN search tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(heading, '')), 'A') ||
      setweight(to_tsvector('simple', content), 'B')
    ) STORED
  `.execute(db);
  await db.schema.createIndex('node_chunks_search_idx').on('node_chunks').using('gin').column('search').execute();
  await db.schema.createIndex('node_chunks_node_idx').on('node_chunks').columns(['node_id', 'idx']).execute();
  await db.schema.createIndex('node_chunks_ws_idx').on('node_chunks').column('workspace_id').execute();

  await db.schema
    .createTable('node_sources')
    .addColumn('node_id', 'uuid', (c) => c.notNull().references('nodes.id').onDelete('cascade'))
    .addColumn('source_node_id', 'uuid', (c) => c.notNull().references('nodes.id').onDelete('cascade'))
    .addColumn('source_version', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('node_sources_pk', ['node_id', 'source_node_id'])
    .execute();

  await db.schema
    .createTable('doc_designs')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('palette', 'jsonb', (c) => c.notNull())
    .addColumn('font_heading', 'text', (c) => c.notNull().defaultTo('sans'))
    .addColumn('font_body', 'text', (c) => c.notNull().defaultTo('sans'))
    .addColumn('layout', 'text', (c) => c.notNull().defaultTo('standard'))
    .addColumn('header_text', 'text')
    .addColumn('footer_text', 'text')
    .addColumn('logo_file_id', 'uuid', (c) => c.references('files.id').onDelete('set null'))
    .addColumn('cover_file_id', 'uuid', (c) => c.references('files.id').onDelete('set null'))
    .addColumn('guidelines', 'text')
    .addColumn('created_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable('nodes')
    .addColumn('design_id', 'uuid', (c) => c.references('doc_designs.id').onDelete('set null'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nodes').dropColumn('design_id').execute();
  await db.schema.dropTable('doc_designs').execute();
  await db.schema.dropTable('node_sources').execute();
  await db.schema.dropTable('node_chunks').execute();
  await db.schema.alterTable('nodes').dropColumn('indexed_at').dropColumn('ai_usage').execute();
}
