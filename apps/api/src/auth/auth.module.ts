import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';

import { ResourceOwnershipGuard } from './resource-ownership.guard';

import { SessionAuthGuard } from './session-auth.guard';

@Module({
  controllers: [AuthController],

  providers: [
    AuthService,

    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },

    {
      provide: APP_GUARD,
      useClass: ResourceOwnershipGuard,
    },
  ],

  exports: [AuthService],
})
export class AuthModule {}
