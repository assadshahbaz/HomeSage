import { Module } from '@nestjs/common';
import { HomesageModule } from '../homesage/homesage.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [HomesageModule],
  controllers: [HealthController],
})
export class HealthModule {}
