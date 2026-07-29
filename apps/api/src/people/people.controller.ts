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
import { SetCentralDto } from './dto/set-central.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post()
  create(@Body() dto: CreatePersonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.peopleService.create(dto, user.id);
  }

  @Get()
  findAll(
    @Query() query: FindPeopleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.peopleService.findAll(user.id, query);
  }

  @Get('central')
  findCentral(@CurrentUser() user: AuthenticatedUser) {
    return this.peopleService.findCentral(user.id);
  }

  /**
   * Troca quem é a pessoa central (RN-018). É `PUT` num recurso só — "a pessoa
   * central" é uma —, e não um `PATCH` na pessoa: a operação mexe em duas.
   */
  @Put('central')
  setCentral(
    @Body() dto: SetCentralDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.peopleService.setCentral(dto.personId, user.id);
  }

  /**
   * A imagem em si, fora do JSON da pessoa (ADR-011). A URL não muda quando a
   * foto muda, então o cache é resolvido por `ETag`: o web pendura a data do
   * upload na query, e o navegador revalida em vez de baixar de novo.
   */
  @Get(':id/photo')
  async findPhoto(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const photo = await this.peopleService.findPhoto(id, user.id);
    res
      .type(photo.mimeType)
      .set({
        ETag: `"${photo.updatedAt.getTime()}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      })
      .send(photo.bytes);
  }

  @Put(':id/photo')
  savePhoto(
    @Param('id') id: string,
    @Body() dto: UploadPhotoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.peopleService.savePhoto(id, dto, user.id);
  }

  @Delete(':id/photo')
  removePhoto(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.peopleService.removePhoto(id, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.peopleService.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.peopleService.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.peopleService.remove(id, user.id);
  }
}
