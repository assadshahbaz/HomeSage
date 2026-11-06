import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '../../contracts/index.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  /** Reports every backing service, and answers 503 when any of them is down. */
  @Get()
  public async check(): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status === 'down') {
      // The body stays the contract shape, so a caller reading a 503 still
      // learns which service was the problem.
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
