import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SpeechAiClientService } from './speech-ai-client.service';

@Module({
  imports: [ConfigModule],

  providers: [SpeechAiClientService],

  exports: [SpeechAiClientService],
})
export class SpeechModule {}
