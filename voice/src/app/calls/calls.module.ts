import { Module } from '@nestjs/common';
import { CallLogRepository } from './call-log.repository.js';
import { CallMemory } from './call-memory.js';

@Module({
  providers: [CallMemory, CallLogRepository],
  exports: [CallMemory, CallLogRepository],
})
export class CallsModule {}
