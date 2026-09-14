import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateStudyPackDto } from './dto/create-study-pack.dto';
import { UpdateStudyPackDto } from './dto/update-study-pack.dto';

@Injectable()
export class StudyPacksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudyPackDto, ownerId: string) {
    return this.prisma.studyPack.create({
      data: {
        name: dto.name,
        description: dto.description,
        goal: dto.goal,
        ownerId,
      },
      include: {
        documents: true,
      },
    });
  }

  async update(id: string, ownerId: string, dto: UpdateStudyPackDto) {
    const hasUpdate =
      dto.name !== undefined ||
      dto.description !== undefined ||
      dto.goal !== undefined;

    if (!hasUpdate) {
      throw new BadRequestException(
        'At least one Study Pack field must be provided',
      );
    }

    const data = {
      ...(dto.name !== undefined
        ? {
            name: dto.name,
          }
        : {}),
      ...(dto.description !== undefined
        ? {
            description: dto.description,
          }
        : {}),
      ...(dto.goal !== undefined
        ? {
            goal: dto.goal,
          }
        : {}),
    };

    const result = await this.prisma.studyPack.updateMany({
      where: {
        id,
        ownerId,
      },
      data,
    });

    if (result.count === 0) {
      throw new NotFoundException(`Study pack ${id} was not found`);
    }

    return this.findOne(id, ownerId);
  }

  async findAll(ownerId: string) {
    return this.prisma.studyPack.findMany({
      where: {
        ownerId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });
  }

  async findOne(id: string, ownerId: string) {
    const studyPack = await this.prisma.studyPack.findFirst({
      where: {
        id,
        ownerId,
      },
      include: {
        documents: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!studyPack) {
      throw new NotFoundException(`Study pack ${id} was not found`);
    }

    return studyPack;
  }
}
