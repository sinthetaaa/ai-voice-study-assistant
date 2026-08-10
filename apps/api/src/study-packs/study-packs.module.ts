import { Module } from '@nestjs/common';
import { StudyPacksController } from './study-packs.controller';
import { StudyPacksService } from './study-packs.service';

@Module({
  controllers: [StudyPacksController],
  providers: [StudyPacksService],
})
export class StudyPacksModule {}
