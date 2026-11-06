import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  await db.schema
    .createTable('workspaces')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('email', 'text', (c) => c.notNull().unique())
    .addColumn('password_hash', 'text', (c) => c.notNull())
    .addColumn('role', 'text', (c) => c.notNull().defaultTo('editor'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('spaces')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (c) => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('slug', 'text', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('icon', 'text')
    .addColumn('color', 'text')
    .addColumn('created_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('spaces_workspace_slug_unique', ['workspace_id', 'slug'])
    .execute();

  // "nodes" = qualquer item da árvore de um espaço (página, processo, diagrama, board, SQL...)
  await db.schema
    .createTable('nodes')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('space_id', 'uuid', (c) => c.notNull().references('spaces.id').onDelete('cascade'))
    .addColumn('parent_id', 'uuid', (c) => c.references('nodes.id').onDelete('cascade'))
    .addColumn('type', 'text', (c) => c.notNull().defaultTo('page'))
    .addColumn('title', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('icon', 'text')
    .addColumn('content', 'jsonb')
    .addColumn('text_content', 'text')
    .addColumn('position', 'double precision', (c) => c.notNull().defaultTo(0))
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('draft'))
    .addColumn('owner_id', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('review_due_at', 'timestamptz')
    .addColumn('created_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('updated_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    ALTER TABLE nodes ADD COLUMN search tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(text_content, '')), 'B')
    ) STORED
  `.execute(db);
  await sql`CREATE INDEX nodes_search_idx ON nodes USING gin (search)`.execute(db);
  await db.schema.createIndex('nodes_space_parent_idx').on('nodes').columns(['space_id', 'parent_id']).execute();

  await db.schema
    .createTable('node_versions')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('node_id', 'uuid', (c) => c.notNull().references('nodes.id').onDelete('cascade'))
    .addColumn('version', 'integer', (c) => c.notNull())
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('content', 'jsonb')
    .addColumn('text_content', 'text')
    .addColumn('message', 'text')
    .addColumn('created_by', 'uuid', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('node_versions_node_version_unique', ['node_id', 'version'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['node_versions', 'nodes', 'spaces', 'users', 'workspaces']) {
    await db.schema.dropTable(t).ifExists().execute();
  }
}
