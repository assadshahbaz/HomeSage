import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { chatRequestSchema } from '../../contracts/index.js';
import type { ChatRequest } from '../../contracts/index.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { Throttle } from '../../platform/throttler/throttle.decorator.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { ChatService } from './chat.service.js';
import { SseStream } from './stream/sse-stream.js';

/** Under the idle limit common proxies apply, often 30 to 60 seconds. */
export const CHAT_HEARTBEAT_MS = 15_000;

/** Shown to the user when a turn fails after the stream opened. Says nothing about why. */
export const CHAT_ERROR_MESSAGE = 'Something went wrong while answering. Please try again.';

@Controller('chat')
export class ChatController {
  public constructor(
    private readonly chat: ChatService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Answers a question as a server sent events stream: route, retrieval, the
   * guarded answer as tokens, citations, done. A bad body or a caller over the
   * limit is refused before the stream opens. A failure after that ends the
   * stream with one `error` event, and a client that goes away stops the turn,
   * which closes the model stream behind it.
   */
  @Post()
  // Each turn can cost three model calls, so one caller cannot drain the budget.
  @Throttle('chat')
  public async ask(
    @Body(new ZodValidationPipe(chatRequestSchema)) body: ChatRequest,
    @Res() response: Response,
  ): Promise<void> {
    const stream = new SseStream(response, CHAT_HEARTBEAT_MS);
    try {
      for await (const event of this.chat.answerQuestion(body.question)) {
        if (!stream.isOpen) {
          // Leaving the loop returns the generators down to the model stream, which aborts.
          break;
        }
        stream.send(event);
      }
    } catch (error) {
      this.logger.error(
        'chat stream failed',
        { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) },
        ChatController.name,
      );
      stream.send({ type: 'error', message: CHAT_ERROR_MESSAGE });
    } finally {
      stream.end();
    }
  }
}
