import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { DATABASE } from '../../infra/store/database.symbol.js';
import { HomesageClient } from '../homesage/homesage-client.js';

type ServiceStatus = 'up' | 'down';

/** Response body of `GET /health`. */
export interface HealthReport {
  readonly status: ServiceStatus;
  readonly services: { readonly database: ServiceStatus; readonly homesage: ServiceStatus };
}

/**
 * Reports this server's database and HomeSage. Answers 503 with the same body
 * when either is down, so a check before a demo names the part at fault.
 */
@Controller('health')
export class HealthController {
  public constructor(
    @Inject(DATABASE) private readonly database: DatabaseSync,
    private readonly homesage: HomesageClient,
  ) {}

  @Get()
  public async check(): Promise<HealthReport> {
    const database = this.databaseStatus();
    const homesage: ServiceStatus = (await this.homesage.isHealthy()) ? 'up' : 'down';
    const report: HealthReport = {
      status: database === 'up' && homesage === 'up' ? 'up' : 'down',
      services: { database, homesage },
    };
    if (report.status === 'down') {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  private databaseStatus(): ServiceStatus {
    try {
      this.database.prepare('SELECT 1').get();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
