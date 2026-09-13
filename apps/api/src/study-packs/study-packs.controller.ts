import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/session-auth.guard';

import { CreateStudyPackDto } from './dto/create-study-pack.dto';

import { StudyPackOverviewService } from './study-pack-overview.service';

import { StudyPackProgressService } from './study-pack-progress.service';

import { StudyPacksService } from './study-packs.service';

@Controller('study-packs')
export class StudyPacksController {
  constructor(
    private readonly studyPacksService: StudyPacksService,

    private readonly studyPackOverviewService: StudyPackOverviewService,

    private readonly studyPackProgressService: StudyPackProgressService,
  ) {}

  private requireUserId(request: AuthenticatedRequest): string {
    const userId = request.authUser?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return userId;
  }

  @Post()
  create(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    createStudyPackDto: CreateStudyPackDto,
  ) {
    return this.studyPacksService.create(
      createStudyPackDto,
      this.requireUserId(request),
    );
  }

  @Post('claim-legacy')
  claimLegacy(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.studyPacksService.claimLegacyPacks(this.requireUserId(request));
  }

  @Get()
  findAll(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.studyPacksService.findAll(this.requireUserId(request));
  }

  @Get('overview')
  findOverview(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.studyPackOverviewService.findAll(this.requireUserId(request));
  }

  @Get(':id/progress')
  findProgress(
    @Req()
    request: AuthenticatedRequest,

    @Param('id')
    id: string,
  ) {
    return this.studyPackProgressService.findOne(
      id,
      this.requireUserId(request),
    );
  }

  @Get(':id')
  findOne(
    @Req()
    request: AuthenticatedRequest,

    @Param('id')
    id: string,
  ) {
    return this.studyPacksService.findOne(id, this.requireUserId(request));
  }
}
