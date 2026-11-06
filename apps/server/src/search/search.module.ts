import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectDb } from '../database/database.module';
import type { DB } from '../database/types';
import { AuthUser, CurrentUser } from '../auth/public.decorator';

@Injectable()
export class SearchService {
  constructor(@InjectDb() private readonly db: Kysely<DB>) {}

  /** Busca full-text com prefixo ("migra" encontra "migração"). A busca semântica (pgvector) chega na Fase 2. */
  async search(user: AuthUser, q: string) {
    const terms = (q ?? '')
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter(Boolean)
      .slice(0, 8);
    if (!terms.length) return [];
    const tsquery = terms.map((t) => `${t}:*`).join(' & ');

    const { rows } = await sql<{
      id: string;
      title: string;
      type: string;
      status: string;
      space_name: string;
      space_slug: string;
      snippet: string;
      updated_at: Date;
    }>`
      SELECT n.id, n.title, n.type, n.status, n.updated_at,
             s.name AS space_name, s.slug AS space_slug,
             ts_headline('simple', coalesce(n.text_content, ''), to_tsquery('simple', ${tsquery}),
                         'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8, MaxFragments=1') AS snippet
      FROM nodes n
      JOIN spaces s ON s.id = n.space_id
      WHERE s.workspace_id = ${user.workspaceId}
        AND (n.search @@ to_tsquery('simple', ${tsquery}) OR n.title ILIKE ${'%' + q.trim() + '%'})
      ORDER BY ts_rank(n.search, to_tsquery('simple', ${tsquery})) DESC, n.updated_at DESC
      LIMIT 20
    `.execute(this.db);
    return rows;
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.searchService.search(user, q ?? '');
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
