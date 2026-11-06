import { Module } from '@nestjs/common';
import { Clock } from '../../platform/clock/clock.js';
import { AgentToolsModule } from '../agent-tools/agent-tools.module.js';
import { CallsModule } from '../calls/calls.module.js';
import { VapiSecretGuard } from './vapi-secret.guard.js';
import { VapiController } from './vapi.controller.js';

@Module({
  imports: [AgentToolsModule, CallsModule],
  controllers: [VapiController],
  providers: [Clock, VapiSecretGuard],
})
export class VapiModule {}
