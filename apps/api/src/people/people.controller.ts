import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { FindPeopleQueryDto } from './dto/find-people-query.dto';
import { UploadPhotoDto } from './dto/upload-photo.dto';

@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.peopleService.create(dto);
  }

  @Get()
  findAll(@Query() query: FindPeopleQueryDto) {
    return this.peopleService.findAll(query);
  }

  @Get('central')
  findCentral() {
    return this.peopleService.findCentral();
  }

  /**
   * A imagem em si, fora do JSON da pessoa (ADR-011). A URL não muda quando a
   * foto muda, então o cache é resolvido por `ETag`: o web pendura a data do
   * upload na query, e o navegador revalida em vez de baixar de novo.
   */
  @Get(':id/photo')
  async findPhoto(@Param('id') id: string, @Res() res: Response) {
    const photo = await this.peopleService.findPhoto(id);
    res
      .type(photo.mimeType)
      .set({
        ETag: `"${photo.updatedAt.getTime()}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      })
      .send(photo.bytes);
  }

  @Put(':id/photo')
  savePhoto(@Param('id') id: string, @Body() dto: UploadPhotoDto) {
    return this.peopleService.savePhoto(id, dto);
  }

  @Delete(':id/photo')
  removePhoto(@Param('id') id: string) {
    return this.peopleService.removePhoto(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.peopleService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.peopleService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.peopleService.remove(id);
  }
}
