import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, map, Subject, switchMap } from 'rxjs';

import { ChatResource } from '../resources/chat/chat.resource';
import { ChatSession } from './session/chat-session';
import type { ChatTurn } from './turn/chat-turn';
import {
  applyChatItem,
  CHAT_STAGE,
  citedIds,
  isStreaming,
  retrievedProperties,
  startTurn,
} from './turn/chat-turn';

/** Start streaming a turn, or stop whichever is streaming. */
type StreamCommand =
  | { readonly kind: 'ask'; readonly turnId: number; readonly question: string }
  | { readonly kind: 'stop' };

/**
 * The conversation on screen: every turn, what its stream has sent and the
 * stage it is in. One turn streams at a time; asking again or starting a new
 * conversation cancels it, which aborts its request. Components read the
 * signals and call `ask()` and `newConversation()`; nothing else holds chat state.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly resource = inject(ChatResource);
  private readonly session = inject(ChatSession);
  private readonly commands = new Subject<StreamCommand>();
  private readonly allTurns = signal<readonly ChatTurn[]>([]);
  private nextTurnId = 1;

  public readonly turns = this.allTurns.asReadonly();
  /** The newest turn, or null before the first question. */
  public readonly current = computed(() => this.allTurns().at(-1) ?? null);
  /** True while an answer streams, so a page can disable its input. */
  public readonly busy = computed(() => {
    const turn = this.current();
    return turn !== null && isStreaming(turn);
  });
  public readonly stage = computed(() => this.current()?.stage ?? null);
  public readonly route = computed(() => this.current()?.route ?? null);
  public readonly retrieval = computed(() => this.current()?.retrieval ?? null);
  public readonly citations = computed(() => this.current()?.citations ?? null);
  /** Only from the final citations, never from markers in the streamed text. */
  public readonly citedIds = computed(() => {
    const turn = this.current();
    return turn === null ? [] : citedIds(turn);
  });
  public readonly retrievedProperties = computed(() => {
    const turn = this.current();
    return turn === null ? [] : retrievedProperties(turn);
  });

  public constructor() {
    this.commands
      .pipe(
        // Switching unsubscribes from the stream before, which aborts its request.
        switchMap((command) =>
          command.kind === 'stop'
            ? EMPTY
            : this.resource
                .stream({ question: command.question, sessionId: this.session.id() })
                .pipe(map((item) => ({ turnId: command.turnId, item }))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ turnId, item }) => {
        this.update(turnId, (turn) => applyChatItem(turn, item));
      });
  }

  /** Asks a question in this conversation, cancelling any answer still streaming. */
  public ask(question: string): void {
    this.cancelStreaming();
    const turn = startTurn(this.nextTurnId++, question);
    this.allTurns.update((turns) => [...turns, turn]);
    this.commands.next({ kind: 'ask', turnId: turn.id, question });
  }

  /** Clears the screen and starts a conversation the server has no memory of. */
  public newConversation(): void {
    this.commands.next({ kind: 'stop' });
    this.allTurns.set([]);
    this.session.renew();
  }

  private cancelStreaming(): void {
    this.allTurns.update((turns) =>
      turns.map((turn) => (isStreaming(turn) ? { ...turn, stage: CHAT_STAGE.CANCELLED } : turn)),
    );
  }

  private update(turnId: number, change: (turn: ChatTurn) => ChatTurn): void {
    this.allTurns.update((turns) =>
      turns.map((turn) => (turn.id === turnId ? change(turn) : turn)),
    );
  }
}
