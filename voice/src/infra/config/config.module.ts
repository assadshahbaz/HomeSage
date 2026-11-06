import { Global, Module } from '@nestjs/common';
import { toAppConfig } from './app-config.js';
import { APP_CONFIG } from './app-config.symbol.js';
import { validateEnv } from './env.validation.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => toAppConfig(validateEnv(process.env)) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
