import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateStudyPackDto } from './dto/create-study-pack.dto';

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
