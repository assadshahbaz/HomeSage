import { Module } from '@nestjs/common';
import { HomesageClient } from './homesage-client.js';

@Module({
  providers: [HomesageClient],
  exports: [HomesageClient],
})
export class HomesageModule {}
