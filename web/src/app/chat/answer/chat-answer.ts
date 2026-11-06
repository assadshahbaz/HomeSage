import { Component, computed, input, output } from '@angular/core';

import { AnswerLine } from './answer-line';
import { parseAnswer } from './answer-text';

/**
 * A streamed answer as paragraphs and lists. Every part is interpolated as
 * text, so HTML in the answer is shown, never run. A citation marker becomes a
 * button only when its id is in `linkedIds`, the final citations. Until they
 * arrive a marker is plain text; once they are `final`, one they leave out is removed.
 */
@Component({
  selector: 'hs-chat-answer',
  imports: [AnswerLine],
  templateUrl: './chat-answer.html',
})
export class ChatAnswer {
  public readonly text = input.required<string>();
  public readonly linkedIds = input<readonly string[]>([]);
  /** True once the final citations have arrived, so markers they leave out are dropped. */
  public readonly final = input(false);
  public readonly citationSelected = output<string>();

  protected readonly blocks = computed(() =>
    parseAnswer(this.text(), new Set(this.linkedIds()), this.final()),
  );

  protected selectCitation(id: string): void {
    this.citationSelected.emit(id);
  }
}
