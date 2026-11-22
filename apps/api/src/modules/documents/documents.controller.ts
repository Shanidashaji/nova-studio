import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile as Upload,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CreateDocument,
  DOCUMENT_MAX_BYTES,
  DocumentListQuery,
  NewDocumentVersion,
  type SessionUser,
} from '@nova/shared';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { DocumentsService } from './documents.service';
import type { UploadedFile } from './file-type';

/** Memory storage: the file is validated before anything is written to storage (ADR-0012). */
const upload = FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } });

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions('document:read')
  list(
    @Query(new ZodValidationPipe(DocumentListQuery)) q: DocumentListQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.documents.list(q, user);
  }

  @Get(':id')
  @RequirePermissions('document:read')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.documents.get(id, user);
  }

  @Post()
  @RequirePermissions('document:write')
  @UseInterceptors(upload)
  create(
    @Body(new ZodValidationPipe(CreateDocument)) body: CreateDocument,
    @Upload() file: UploadedFile | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    return this.documents.create(body, file, user);
  }

  @Post(':id/versions')
  @RequirePermissions('document:write')
  @UseInterceptors(upload)
  addVersion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(NewDocumentVersion)) body: NewDocumentVersion,
    @Upload() file: UploadedFile | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    return this.documents.addVersion(id, body.note, file, user);
  }

  /** Always a download (never rendered inline) with sniffing disabled. */
  @Get(':id/versions/:version/file')
  @RequirePermissions('document:read')
  async download(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.documents.open(id, version, user);
    res.set({
      'Content-Type': f.mimeType,
      'Content-Length': String(f.sizeBytes),
      'Content-Disposition': `attachment; filename="${f.fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(f.stream);
  }
}
