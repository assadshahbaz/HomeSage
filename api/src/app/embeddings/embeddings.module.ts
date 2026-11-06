import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingProvider } from '../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../infra/config/embeddings.config.js';
import { EmbeddingService } from './embedding.service.js';
import { EMBEDDING_PROVIDER } from './embedding.symbol.js';
import { createEmbeddingProvider } from './providers/embedding-provider-registry.js';

@Module({
  providers: [
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): EmbeddingProvider =>
        createEmbeddingProvider(configService.getOrThrow<EmbeddingsConfig>('embeddings')),
    },
    EmbeddingService,
  ],
  exports: [EmbeddingService],
})
export class EmbeddingsModule {}
