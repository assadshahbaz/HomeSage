import { Module } from '@nestjs/common';
import { MessageRepository } from './message.repository.js';
import { ValuationRequestRepository } from './valuation-request.repository.js';

@Module({
  providers: [ValuationRequestRepository, MessageRepository],
  exports: [ValuationRequestRepository, MessageRepository],
})
export class LeadsModule {}
