import type { ChatIntent, RouteFallback, SearchFilters } from '../../contracts/index.js';

/** How the router read a question, checked and ready for retrieval. */
export interface Route {
  readonly intent: ChatIntent;
  /** Only filters whose every value the data holds, defaults included. */
  readonly filters: SearchFilters;
  /** What to search by meaning. Empty for a structured or out of scope question. */
  readonly semanticQuery: string;
  /** The question rewritten to stand on its own; the question itself when it already does. */
  readonly standaloneQuestion: string;
  /** Earlier cited listings a follow up refers to, as MySQL ids. */
  readonly propertyIds: readonly string[];
  /** Why the router's own reading was replaced with plain hybrid search; null when it was used. */
  readonly fallback: RouteFallback | null;
}

/** One earlier turn of the conversation, as the router is shown it. Never the answer text. */
export interface RouterTurn {
  readonly question: string;
  readonly standaloneQuestion: string;
  readonly intent: ChatIntent;
  readonly filters: SearchFilters;
  /** The ids the answer cited, in order of first citation. */
  readonly citedIds: readonly string[];
}
