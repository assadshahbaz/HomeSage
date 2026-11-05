import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface RequestContext {
  requestId: string;
}

/**
 * The only way code below a controller reaches request scoped values. Backed by
 * `AsyncLocalStorage`, since Nest request scope spreads up the injection chain
 * and would catch every service on the way.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  /** Runs `work` with a context that every read underneath it will see. */
  public run<T>(context: RequestContext, work: () => T): T {
    return this.storage.run(context, work);
  }

  /**
   * The current request's id, or undefined outside one. Never throws: the
   * import tool, the eval runner and the health checks run with no request.
   */
  public getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
