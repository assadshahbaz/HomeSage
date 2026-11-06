import { Module } from '@nestjs/common';
import { Clock } from '../../platform/clock/clock.js';
import { CallsModule } from '../calls/calls.module.js';
import { HomesageModule } from '../homesage/homesage.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { Notifier } from '../notify/notifier.js';
import { ViewingsModule } from '../viewings/viewings.module.js';
import { BookViewingTool } from './book-viewing.tool.js';
import { GetViewingSlotsTool } from './get-viewing-slots.tool.js';
import { RequestValuationTool } from './request-valuation.tool.js';
import { SearchPropertiesTool } from './search-properties.tool.js';
import { TakeMessageTool } from './take-message.tool.js';
import { ToolDispatcher } from './tool-dispatcher.js';

@Module({
  imports: [CallsModule, HomesageModule, LeadsModule, ViewingsModule],
  providers: [
    Clock,
    Notifier,
    SearchPropertiesTool,
    GetViewingSlotsTool,
    BookViewingTool,
    RequestValuationTool,
    TakeMessageTool,
    ToolDispatcher,
  ],
  exports: [ToolDispatcher],
})
export class AgentToolsModule {}
