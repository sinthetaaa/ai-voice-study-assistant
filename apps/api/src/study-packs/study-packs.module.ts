import { Module } from '@nestjs/common';

import { StudySessionsModule } from '../study-sessions/study-sessions.module';
import { StudyPackOverviewService } from './study-pack-overview.service';
import { StudyPacksController } from './study-packs.controller';
import { StudyPacksService } from './study-packs.service';

@Module({
  imports: [StudySessionsModule],
  controllers: [StudyPacksController],
  providers: [StudyPacksService, StudyPackOverviewService],
})
export class StudyPacksModule {}
