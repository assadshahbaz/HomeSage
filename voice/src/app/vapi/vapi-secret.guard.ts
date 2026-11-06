import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';
import { bearerToken, secretMatches } from '../../platform/auth/secret-match.js';

/**
 * Lets a webhook through only when it carries the shared secret, either as
 * `X-Vapi-Secret` (Vapi's inline secret, or a credential with that header
 * name) or as a bearer token (a Vapi bearer credential). Anyone who finds the
 * public URL otherwise gets a 403 and touches nothing.
 */
@Injectable()
export class VapiSecretGuard implements CanActivate {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const headerSecret = request.header('x-vapi-secret');
    const bearer = bearerToken(request.header('authorization'));
    return (
      secretMatches(headerSecret, this.config.webhookSecret) ||
      secretMatches(bearer, this.config.webhookSecret)
    );
  }
}
