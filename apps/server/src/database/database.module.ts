import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Kysely } from 'kysely';
import { createDb } from './db';
import type { DB } from './types';

export const KYSELY = Symbol('KYSELY');
export const InjectDb = () => Inject(KYSELY);

@Global()
@Module({
  providers: [{ provide: KYSELY, useFactory: () => createDb() }],
  exports: [KYSELY],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
