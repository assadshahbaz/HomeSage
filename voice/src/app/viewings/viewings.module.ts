import { Module } from '@nestjs/common';
import { ViewingRepository } from './viewing.repository.js';

@Module({
  providers: [ViewingRepository],
  exports: [ViewingRepository],
})
export class ViewingsModule {}
