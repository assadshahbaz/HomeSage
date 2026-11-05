import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CallLogRepository } from '../calls/call-log.repository.js';
import type { CallRow } from '../calls/call-log.repository.js';
import { MessageRepository } from '../leads/message.repository.js';
import type { MessageRow } from '../leads/message.repository.js';
import { ValuationRequestRepository } from '../leads/valuation-request.repository.js';
import type { ValuationRequestRow } from '../leads/valuation-request.repository.js';
import { ViewingRepository } from '../viewings/viewing.repository.js';
import type { ViewingRow } from '../viewings/viewing.repository.js';
import { AdminTokenGuard } from './admin-token.guard.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * Read only views of what the phone agent has done, newest first, for the
 * office or a demo. Every route needs the admin token, since the rows hold
 * callers' names, numbers and transcripts.
 */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  public constructor(
    private readonly viewings: ViewingRepository,
    private readonly valuations: ValuationRequestRepository,
    private readonly messages: MessageRepository,
    private readonly calls: CallLogRepository,
  ) {}

  @Get('viewings')
  public latestViewings(
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number,
  ): ViewingRow[] {
    return this.viewings.latest(clamp(limit));
  }

  @Get('valuations')
  public latestValuations(
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number,
  ): ValuationRequestRow[] {
    return this.valuations.latest(clamp(limit));
  }

  @Get('messages')
  public latestMessages(
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number,
  ): MessageRow[] {
    return this.messages.latest(clamp(limit));
  }

  @Get('calls')
  public latestCalls(
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number,
  ): CallRow[] {
    return this.calls.latest(clamp(limit));
  }
}

function clamp(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}
