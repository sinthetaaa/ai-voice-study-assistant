import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { MasteryController } from './mastery.controller';
import { MasteryService } from './mastery.service';

@Module({
  imports: [PrismaModule],

  controllers: [MasteryController],

  providers: [MasteryService],

  exports: [MasteryService],
})
export class MasteryModule {}
