import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { StudySessionsModule } from '../study-sessions/study-sessions.module';
import { StudyPackDeletionService } from './study-pack-deletion.service';
import { StudyPackOverviewService } from './study-pack-overview.service';
import { StudyPackProgressService } from './study-pack-progress.service';
import { StudyPacksController } from './study-packs.controller';
import { StudyPacksService } from './study-packs.service';

@Module({
  imports: [StudySessionsModule, StorageModule],
  controllers: [StudyPacksController],
  providers: [
    StudyPacksService,
    StudyPackDeletionService,
    StudyPackOverviewService,
    StudyPackProgressService,
  ],
})
export class StudyPacksModule {}
