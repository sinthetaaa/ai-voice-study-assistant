import { Module } from '@nestjs/common';

import { MasteryModule } from '../mastery/mastery.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AdaptiveController } from './adaptive.controller';
import { AdaptiveService } from './adaptive.service';

@Module({
  imports: [PrismaModule, MasteryModule],

  controllers: [AdaptiveController],

  providers: [AdaptiveService],

  exports: [AdaptiveService],
})
export class AdaptiveModule {}
