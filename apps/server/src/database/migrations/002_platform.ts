import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('last_login_at', 'timestamptz')
    .execute();

  await db.schema
    .createTable('password_resets')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // Configurações por workspace (IA, e-mail, geral). Segredos são gravados criptografados.
  await db.schema
    .createTable('settings')
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('value', 'jsonb', (c) => c.notNull())
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('settings_pk', ['workspace_id', 'key'])
    .execute();

  // Tokens de API (usados pelo servidor MCP e integrações).
  await db.schema
    .createTable('api_tokens')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('prefix', 'text', (c) => c.notNull())
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('can_write', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // Propostas de mudança (da IA, do MCP ou de pessoas) — sempre aprovadas por um humano.
  await db.schema
    .createTable('change_requests')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('node_id', 'uuid', (c) => c.notNull().references('nodes.id').onDelete('cascade'))
    .addColumn('base_version', 'integer')
    .addColumn('summary', 'text', (c) => c.notNull())
    .addColumn('instruction', 'text')
    .addColumn('proposed_title', 'text')
    .addColumn('proposed_markdown', 'text', (c) => c.notNull())
    .addColumn('source', 'text', (c) => c.notNull())
    .addColumn('author_id', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('author_label', 'text')
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('open'))
    .addColumn('resolved_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('change_requests_node_idx').on('change_requests').columns(['node_id', 'status']).execute();

  // Arquivos enviados (imagens e originais importados).
  await db.schema
    .createTable('files')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('node_id', 'uuid', (c) => c.references('nodes.id').onDelete('set null'))
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('mime', 'text', (c) => c.notNull())
    .addColumn('size', 'integer', (c) => c.notNull())
    .addColumn('storage_key', 'text', (c) => c.notNull())
    .addColumn('created_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['files', 'change_requests', 'api_tokens', 'settings', 'password_resets']) {
    await db.schema.dropTable(t).ifExists().execute();
  }
  await db.schema.alterTable('users').dropColumn('active').dropColumn('last_login_at').execute();
}
