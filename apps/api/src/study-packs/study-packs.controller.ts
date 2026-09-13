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

  @Post()
  create(
    @Body()
    createStudyPackDto: CreateStudyPackDto,
  ) {
    return this.studyPacksService.create(createStudyPackDto);
  }

  @Post('claim-legacy')
  claimLegacy(
    @Req()
    request: AuthenticatedRequest,
  ) {
    const userId = request.authUser?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.studyPacksService.claimLegacyPacks(userId);
  }

  @Get()
  findAll() {
    return this.studyPacksService.findAll();
  }

  @Get('overview')
  findOverview() {
    return this.studyPackOverviewService.findAll();
  }

  @Get(':id/progress')
  findProgress(
    @Param('id')
    id: string,
  ) {
    return this.studyPackProgressService.findOne(id);
  }

  @Get(':id')
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.studyPacksService.findOne(id);
  }
}
