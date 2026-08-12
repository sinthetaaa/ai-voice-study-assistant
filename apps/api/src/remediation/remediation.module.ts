import { Module } from '@nestjs/common';

import { AdaptiveModule } from '../adaptive/adaptive.module';
import { PrismaModule } from '../prisma/prisma.module';

import { RemediationAiClientService } from './remediation-ai-client.service';
import { RemediationController } from './remediation.controller';
import { RemediationService } from './remediation.service';

@Module({
  imports: [PrismaModule, AdaptiveModule],

  controllers: [RemediationController],

  providers: [RemediationAiClientService, RemediationService],

  exports: [RemediationService],
})
export class RemediationModule {}
