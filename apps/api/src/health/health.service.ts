import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private readonly postgresPool: Pool;
  private readonly redisClient: RedisClientType;

  constructor(
    private readonly configService: ConfigService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {
    const databaseUrl = this.configService.getOrThrow<string>('DATABASE_URL');

    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');

    this.postgresPool = new Pool({
      connectionString: databaseUrl,
    });

    this.redisClient = createClient({
      url: redisUrl,
    });
  }

  async onModuleInit() {
    if (!this.redisClient.isOpen) {
      try {
        await this.redisClient.connect();
      } catch {
        // Do not prevent the API from starting.
        // The health endpoint will report Redis as down.
      }
    }
  }

  checkApi() {
    const indicator = this.healthIndicatorService.check('api');

    return indicator.up({
      service: 'studyloop-api',
    });
  }

  async checkPostgres() {
    const indicator = this.healthIndicatorService.check('postgres');

    try {
      await this.postgresPool.query('SELECT 1');

      return indicator.up();
    } catch {
      return indicator.down({
        message: 'PostgreSQL unavailable',
      });
    }
  }

  async checkPgVector() {
    const indicator = this.healthIndicatorService.check('pgvector');

    try {
      const result = await this.postgresPool.query<{
        extversion: string;
      }>(
        `
        SELECT extversion
        FROM pg_extension
        WHERE extname = 'vector'
        `,
      );

      if (result.rowCount === 0) {
        return indicator.down({
          message: 'pgvector extension not installed',
        });
      }

      return indicator.up({
        version: result.rows[0].extversion,
      });
    } catch {
      return indicator.down({
        message: 'Unable to verify pgvector',
      });
    }
  }

  async checkRedis() {
    const indicator = this.healthIndicatorService.check('redis');

    try {
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }

      const response = await this.redisClient.ping();

      if (response !== 'PONG') {
        return indicator.down({
          message: 'Unexpected Redis response',
        });
      }

      return indicator.up();
    } catch {
      return indicator.down({
        message: 'Redis unavailable',
      });
    }
  }

  async onModuleDestroy() {
    await this.postgresPool.end();

    if (this.redisClient.isOpen) {
      await this.redisClient.quit();
    }
  }
}
