import { SetMetadata } from '@nestjs/common';

export const RESOURCE_OWNERSHIP_KEY = 'resource_ownership';

export type OwnedResourceType = 'STUDY_PACK' | 'STUDY_SESSION' | 'EVALUATION';

export type ResourceOwnershipRequirement = {
  resource: OwnedResourceType;
  param: string;
};

export function RequireResourceOwnership(
  resource: OwnedResourceType,
  param: string,
) {
  return SetMetadata(RESOURCE_OWNERSHIP_KEY, {
    resource,
    param,
  } satisfies ResourceOwnershipRequirement);
}
