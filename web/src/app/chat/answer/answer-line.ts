import { Component, computed, input, output } from '@angular/core';

import { TextButton } from '../../ui/text-button/text-button';
import type { AnswerLine as Line } from './answer-text';

/** One line of an answer, its citations linked or plain. */
@Component({
  selector: 'hs-answer-line',
  imports: [TextButton],
  templateUrl: './answer-line.html',
  host: { class: 'contents' },
})
export class AnswerLine {
  public readonly line = input.required<Line>();
  public readonly citationSelected = output<string>();

  protected readonly parts = computed(() =>
    this.line().map((part) =>
      part.kind === 'citation' ? { ...part, label: `Show property P-${part.id}` } : part,
    ),
  );

  protected selectCitation(id: string): void {
    this.citationSelected.emit(id);
  }
}
