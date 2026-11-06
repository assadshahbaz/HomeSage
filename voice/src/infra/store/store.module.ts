import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.symbol.js';
import { openDatabase } from './database.js';
import { DATABASE } from './database.symbol.js';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => openDatabase(config.dbPath),
    },
  ],
  exports: [DATABASE],
})
export class StoreModule implements OnApplicationShutdown {
  public constructor(@Inject(DATABASE) private readonly database: DatabaseSync) {}

  public onApplicationShutdown(): void {
    this.database.close();
  }
}
