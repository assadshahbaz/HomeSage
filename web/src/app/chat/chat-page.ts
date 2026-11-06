import { Component, computed, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { EXAMPLE_QUESTIONS } from '../config/example-questions/example-questions';
import { Button } from '../ui/button/button';
import { EmptyState } from '../ui/empty-state/empty-state';
import { Input } from '../ui/input/input';
import { Spinner } from '../ui/spinner/spinner';
import { TextButton } from '../ui/text-button/text-button';
import { ChatStore } from './chat-store';
import { ChatTurnView } from './turn-view/chat-turn-view';

const QUESTION_ROWS = 2;

/** The chat page, where a visitor asks about properties and reads the answers. */
@Component({
  selector: 'hs-chat-page',
  imports: [Button, ChatTurnView, EmptyState, Input, ReactiveFormsModule, Spinner, TextButton],
  templateUrl: './chat-page.html',
})
export class ChatPage {
  private readonly store = inject(ChatStore);

  protected readonly examples = EXAMPLE_QUESTIONS;
  protected readonly questionRows = QUESTION_ROWS;
  protected readonly question = new FormControl('', { nonNullable: true });
  // The group gives the form Angular's submit handling; without it Send reloads the page.
  protected readonly form = new FormGroup({ question: this.question });
  protected readonly turns = this.store.turns;
  protected readonly busy = this.store.busy;
  protected readonly started = computed(() => this.turns().length > 0);

  /** Sends the question in the box, unless it is empty or an answer is still coming. */
  protected send(): void {
    const question = this.question.value.trim();
    if (question === '' || this.busy()) {
      return;
    }
    this.store.ask(question);
    this.question.reset();
  }

  /** Enter sends; Shift+Enter, and Enter while an input method is composing, add to the text. */
  protected sendOnEnter(event: Event): void {
    if (!(event instanceof KeyboardEvent) || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    this.send();
  }

  protected askExample(question: string): void {
    this.store.ask(question);
  }

  protected startNewConversation(): void {
    this.store.newConversation();
    this.question.reset();
  }
}
