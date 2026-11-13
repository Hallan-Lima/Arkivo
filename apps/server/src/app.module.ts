import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { UsersModule } from './users/users.module';
import { SpacesModule } from './spaces/spaces.module';
import { NodesModule } from './nodes/nodes.module';
import { SearchModule } from './search/search.module';
import { ChangeRequestsModule } from './change-requests/change-requests.module';
import { AiModule } from './ai/ai.module';
import { FilesModule } from './files/files.module';
import { McpModule } from './mcp/mcp.module';
import { NotebookModule } from './notebook/notebook.module';
import { DesignsModule } from './designs/designs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    DatabaseModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    SpacesModule,
    NodesModule,
    SearchModule,
    ChangeRequestsModule,
    AiModule,
    FilesModule,
    McpModule,
    NotebookModule,
    DesignsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
