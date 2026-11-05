import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { semanticSearchRequestSchema } from '../../contracts/index.js';
import type { SemanticSearchRequest, SemanticSearchResponse } from '../../contracts/index.js';
import { Throttle } from '../../platform/throttler/throttle.decorator.js';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe.js';
import { SemanticSearchService } from './semantic-search.service.js';

@Controller('search')
export class SearchController {
  public constructor(private readonly semantic: SemanticSearchService) {}

  /**
   * The properties nearest a query in meaning, with every filter applied inside
   * the search, and the time each step took. Residential only unless the
   * filters ask for other kinds.
   */
  @Post('semantic')
  // Every call embeds the query, so one caller cannot tie up the model.
  @Throttle('search')
  // Nothing is created: the query is read, so success is 200 rather than 201.
  @HttpCode(HttpStatus.OK)
  public async semanticSearch(
    @Body(new ZodValidationPipe(semanticSearchRequestSchema)) body: SemanticSearchRequest,
  ): Promise<SemanticSearchResponse> {
    const { results, timing } = await this.semantic.search(body);
    return {
      query: body.query,
      topK: body.topK,
      filters: body.filters,
      results,
      timing: { embedMs: timing.embedMs, searchMs: timing.searchMs, totalMs: timing.totalMs },
    };
  }
}
