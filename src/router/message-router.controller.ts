import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { OruResult } from '../observation/observation.mapper';
import { MessageRouterService } from './message-router.service';

@Controller('hl7')
export class MessageRouterController {
  constructor(private readonly router: MessageRouterService) {}

  // POST /hl7/convert  body: { "raw": "<any supported HL7 v2 message>" }
  @Post('convert')
  @HttpCode(200)
  convert(@Body() body: { raw?: unknown } | undefined): OruResult {
    const raw = body?.raw;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('"raw" must be a non-empty HL7 string');
    }
    return this.router.convert(raw);
  }
}
