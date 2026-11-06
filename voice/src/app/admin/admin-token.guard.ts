import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';
import { bearerToken, secretMatches } from '../../platform/auth/secret-match.js';

/** Admits a request only with `Authorization: Bearer <ADMIN_TOKEN>`. */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!secretMatches(bearerToken(request.header('authorization')), this.config.adminToken)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
