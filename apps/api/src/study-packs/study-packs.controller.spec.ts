/* eslint-disable @typescript-eslint/no-require-imports */

import { UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/session-auth.guard';
import type { StudyPackDeletionService } from './study-pack-deletion.service';
import type { StudyPackOverviewService } from './study-pack-overview.service';
import type { StudyPackPerformanceService } from './study-pack-performance.service';
import type { StudyPackProgressService } from './study-pack-progress.service';
import type { StudyPacksService } from './study-packs.service';

jest.mock('./study-packs.service', () => ({
  StudyPacksService: class StudyPacksService {},
}));

jest.mock('./study-pack-deletion.service', () => ({
  StudyPackDeletionService: class StudyPackDeletionService {},
}));

jest.mock('./study-pack-overview.service', () => ({
  StudyPackOverviewService: class StudyPackOverviewService {},
}));

jest.mock('./study-pack-performance.service', () => ({
  StudyPackPerformanceService: class StudyPackPerformanceService {},
}));

jest.mock('./study-pack-progress.service', () => ({
  StudyPackProgressService: class StudyPackProgressService {},
}));

const { StudyPacksController } =
  require('./study-packs.controller') as typeof import('./study-packs.controller');

describe('StudyPacksController performance endpoint', () => {
  function createController() {
    const performanceService = {
      findOne: jest.fn(),
    };

    const controller = new StudyPacksController(
      {} as StudyPacksService,
      {} as StudyPackDeletionService,
      {} as StudyPackOverviewService,
      performanceService as unknown as StudyPackPerformanceService,
      {} as StudyPackProgressService,
    );

    return {
      controller,
      performanceService,
    };
  }

  it('passes the authenticated owner ID into the Performance read model', async () => {
    const { controller, performanceService } = createController();

    const expected = {
      studyPack: {
        id: 'pack-1',
        name: 'Operating Systems',
      },
    };

    performanceService.findOne.mockResolvedValue(expected);

    const request = {
      authUser: {
        id: 'user-1',
      },
    } as unknown as AuthenticatedRequest;

    const result = await controller.findPerformance(request, 'pack-1');

    expect(performanceService.findOne).toHaveBeenCalledTimes(1);

    expect(performanceService.findOne).toHaveBeenCalledWith('pack-1', 'user-1');

    expect(result).toBe(expected);
  });

  it('rejects a missing authenticated user before querying Performance', () => {
    const { controller, performanceService } = createController();

    const request = {} as unknown as AuthenticatedRequest;

    expect(() => controller.findPerformance(request, 'pack-1')).toThrow(
      UnauthorizedException,
    );

    expect(performanceService.findOne).not.toHaveBeenCalled();
  });
});
