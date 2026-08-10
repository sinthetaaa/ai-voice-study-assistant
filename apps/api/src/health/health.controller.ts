import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const aiServiceUrl = this.configService.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8000',
    );

    return this.healthCheckService.check([
      () => this.healthService.checkApi(),

      () => this.healthService.checkPostgres(),

      () => this.healthService.checkPgVector(),

      () => this.healthService.checkRedis(),

      () => this.http.pingCheck('ai-service', `${aiServiceUrl}/health`),
    ]);
  }
}
