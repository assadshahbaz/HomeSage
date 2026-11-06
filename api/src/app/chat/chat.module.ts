import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { RouterModule } from '../router/router.module.js';
import { AnswerGenerator } from './answer/answer-generator.js';
import { GuardedAnswer } from './answer/guarded-answer.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

/**
 * `POST /chat`: routes a question, retrieves what it needs and streams the
 * cited answer through the citation guard. Only the guarded answer is ever sent.
 */
@Module({
  imports: [LlmModule, RouterModule, RetrievalModule],
  controllers: [ChatController],
  providers: [AnswerGenerator, GuardedAnswer, ChatService],
})
export class ChatModule {}
