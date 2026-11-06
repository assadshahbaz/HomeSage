import { Module } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { ViewingsModule } from '../viewings/viewings.module.js';
import { AdminTokenGuard } from './admin-token.guard.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [CallsModule, LeadsModule, ViewingsModule],
  controllers: [AdminController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
