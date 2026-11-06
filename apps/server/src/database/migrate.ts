import { Migrator, type Migration, type MigrationProvider } from 'kysely';
import { createDb } from './db';
import * as m001 from './migrations/001_init';
import * as m002 from './migrations/002_platform';
import * as m003 from './migrations/003_file_previews';

// Migrações registradas explicitamente (funciona igual em dev e no build).
const migrations: Record<string, Migration> = {
  '001_init': m001,
  '002_platform': m002,
  '003_file_previews': m003,
};

class StaticProvider implements MigrationProvider {
  async getMigrations() {
    return migrations;
  }
}

export async function runMigrations() {
  const db = createDb();
  const migrator = new Migrator({ db, provider: new StaticProvider() });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Success') console.log(`[migração] ${r.migrationName} aplicada`);
    if (r.status === 'Error') console.error(`[migração] ${r.migrationName} falhou`);
  }
  await db.destroy();
  if (error) throw error;
}
