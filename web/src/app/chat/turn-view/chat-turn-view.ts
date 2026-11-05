import { Component, computed, input, viewChild } from '@angular/core';

import { stageLabel } from '../../config/pipeline-stage/pipeline-stage';
import { PropertyCardList } from '../../property/property-card-list/property-card-list';
import { Spinner } from '../../ui/spinner/spinner';
import { ChatAnswer } from '../answer/chat-answer';
import type { ChatTurn } from '../turn/chat-turn';
import { CHAT_STAGE, citedIds, isStreaming, retrievedProperties } from '../turn/chat-turn';

/**
 * One question and its answer: the stage the pipeline is in while it works,
 * the answer as it streams, and cards for the properties it cited. A citation
 * in the answer sends the reader to its card.
 */
@Component({
  selector: 'hs-chat-turn-view',
  imports: [ChatAnswer, PropertyCardList, Spinner],
  templateUrl: './chat-turn-view.html',
})
export class ChatTurnView {
  public readonly turn = input.required<ChatTurn>();

  private readonly cardList = viewChild(PropertyCardList);

  protected readonly label = computed(() => `Question: ${this.turn().question}`);
  protected readonly streaming = computed(() => isStreaming(this.turn()));
  protected readonly stage = computed(() => stageLabel(this.turn().stage, this.turn().retrieval));
  protected readonly failed = computed(() => this.turn().stage === CHAT_STAGE.FAILED);
  protected readonly cancelled = computed(() => this.turn().stage === CHAT_STAGE.CANCELLED);
  protected readonly citedIds = computed(() => citedIds(this.turn()));
  protected readonly citationsFinal = computed(() => this.turn().citations !== null);
  protected readonly properties = computed(() => retrievedProperties(this.turn()));
  protected readonly searching = computed(() => this.turn().stage === CHAT_STAGE.RETRIEVING);
  // Cards only where there are properties to show: never for an aggregate or a decline.
  protected readonly showCards = computed(
    () => this.searching() || this.turn().retrieval?.kind === 'properties',
  );

  protected showCard(propertyId: string): void {
    this.cardList()?.showCard(propertyId);
  }
}
