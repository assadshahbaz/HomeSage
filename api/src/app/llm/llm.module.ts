import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmProvider } from '../../core/llm-provider.js';
import type { LlmConfig } from '../../infra/config/llm.config.js';
import { createLlmProvider } from './providers/llm-provider-registry.js';
import { LlmService } from './llm.service.js';
import { LLM_PROVIDER } from './llm.symbol.js';
import { PromptLoader } from './prompts/prompt-loader.js';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): LlmProvider =>
        createLlmProvider(configService.getOrThrow<LlmConfig>('llm')),
    },
    PromptLoader,
    LlmService,
  ],
  exports: [LlmService, PromptLoader],
})
export class LlmModule {}
