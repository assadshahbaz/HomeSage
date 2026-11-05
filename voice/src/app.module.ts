import { Module } from '@nestjs/common';
import { AdminModule } from './app/admin/admin.module.js';
import { HealthModule } from './app/health/health.module.js';
import { VapiModule } from './app/vapi/vapi.module.js';
import { ConfigModule } from './infra/config/config.module.js';
import { StoreModule } from './infra/store/store.module.js';

@Module({
  imports: [ConfigModule, StoreModule, VapiModule, AdminModule, HealthModule],
})
export class AppModule {}
