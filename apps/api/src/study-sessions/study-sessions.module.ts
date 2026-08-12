import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({
  imports: [PrismaModule],

  controllers: [StudySessionsController],

  providers: [StudySessionsService],

  exports: [StudySessionsService],
})
export class StudySessionsModule {}
