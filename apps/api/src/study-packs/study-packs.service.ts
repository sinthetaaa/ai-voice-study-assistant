import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudyPackDto } from './dto/create-study-pack.dto';

@Injectable()
export class StudyPacksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudyPackDto) {
    return this.prisma.studyPack.create({
      data: {
        name: dto.name,
        description: dto.description,
        goal: dto.goal,
      },
      include: {
        documents: true,
      },
    });
  }

  async findAll() {
    return this.prisma.studyPack.findMany({
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

  async findOne(id: string) {
    const studyPack = await this.prisma.studyPack.findUnique({
      where: {
        id,
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
