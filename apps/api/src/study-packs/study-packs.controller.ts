import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateStudyPackDto } from './dto/create-study-pack.dto';
import { StudyPacksService } from './study-packs.service';

@Controller('study-packs')
export class StudyPacksController {
  constructor(private readonly studyPacksService: StudyPacksService) {}

  @Post()
  create(@Body() createStudyPackDto: CreateStudyPackDto) {
    return this.studyPacksService.create(createStudyPackDto);
  }

  @Get()
  findAll() {
    return this.studyPacksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.studyPacksService.findOne(id);
  }
}
