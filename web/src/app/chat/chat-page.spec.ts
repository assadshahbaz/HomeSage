import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { ChatRequest } from '@api/contracts';
import { Observable } from 'rxjs';

import { EXAMPLE_QUESTIONS } from '../config/example-questions/example-questions';
import type { ChatStreamItem } from '../resources/chat/chat.resource';
import { ChatResource } from '../resources/chat/chat.resource';
import { ChatPage } from './chat-page';
import { PROPERTIES_STREAM } from './chat-stream.fixture';

/** Each question the page sent, with a way to feed its stream. */
interface Sent {
  readonly request: ChatRequest;
  readonly send: (...items: readonly ChatStreamItem[]) => void;
}

describe('ChatPage', () => {
  let fixture: ComponentFixture<ChatPage>;
  let host: HTMLElement;
  let sent: Sent[];

  const render = async (): Promise<void> => {
    await fixture.whenStable();
  };
  const textarea = (): HTMLTextAreaElement => host.querySelector('textarea')!;
  const button = (name: string): HTMLButtonElement =>
    [...host.querySelectorAll('button')].find((element) => element.textContent.trim() === name)!;
  const questions = (): string[] => sent.map((entry) => entry.request.question);

  async function type(text: string): Promise<void> {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
    await render();
  }

  async function press(key: string, shiftKey = false): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    textarea().dispatchEvent(event);
    await render();
    return event;
  }

  beforeEach(async () => {
    localStorage.clear();
    sent = [];
    const resource: Pick<ChatResource, 'stream'> = {
      stream: (request) =>
        new Observable<ChatStreamItem>((subscriber) => {
          sent.push({
            request,
            send: (...items) => {
              for (const item of items) {
                subscriber.next(item);
              }
            },
          });
        }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ChatResource, useValue: resource }] });
    // jsdom does not lay out, so it has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn<Element['scrollIntoView']>();
    fixture = TestBed.createComponent(ChatPage);
    host = fixture.nativeElement as HTMLElement;
    await render();
  });

  it('offers the example questions before the first one, and asks one when chosen', async () => {
    const examples = EXAMPLE_QUESTIONS.map((question) => button(question));
    expect(examples.every((element) => element instanceof HTMLButtonElement)).toBe(true);

    examples[0]?.click();
    await render();

    expect(questions()).toEqual([EXAMPLE_QUESTIONS[0]]);
    expect(host.textContent).not.toContain('Ask your first question');
  });

  it('sends the question on Enter and clears the box', async () => {
    await type('  3 bed homes in Ellon  ');

    const event = await press('Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(questions()).toEqual(['3 bed homes in Ellon']);
    expect(textarea().value).toBe('');
  });

  it('sends the question when Send is clicked, without a native form submit', async () => {
    await type('3 bed homes in Ellon');
    const submit = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    host.querySelector('form')!.dispatchEvent(submit);
    await render();

    expect(submit.defaultPrevented).toBe(true);
    expect(questions()).toEqual(['3 bed homes in Ellon']);
  });

  it('asks from a click on the Send button', async () => {
    await type('flats in Aberdeen');

    button('Send').click();
    await render();

    expect(questions()).toEqual(['flats in Aberdeen']);
  });

  it('keeps Shift+Enter for a new line', async () => {
    await type('3 bed homes');

    const event = await press('Enter', true);

    expect(event.defaultPrevented).toBe(false);
    expect(questions()).toEqual([]);
  });

  it('sends nothing for an empty question', async () => {
    await type('   ');
    await press('Enter');
    button('Send').click();
    await render();

    expect(questions()).toEqual([]);
  });

  it('disables the box and the send button while an answer streams, then enables them', async () => {
    await type('3 bed homes in Ellon');
    await press('Enter');

    expect(textarea().disabled).toBe(true);
    expect(button('Send').disabled).toBe(true);

    sent[0]?.send(...PROPERTIES_STREAM);
    await render();

    expect(textarea().disabled).toBe(false);
    expect(button('Send').disabled).toBe(false);
  });

  it('shows an error mid stream, enables the box again and answers the next question', async () => {
    await type('3 bed homes in Ellon');
    await press('Enter');
    sent[0]?.send(PROPERTIES_STREAM[0], { type: 'error', message: 'Please try again.' });
    await render();

    expect(host.querySelector('[role="alert"]')?.textContent.trim()).toBe('Please try again.');
    expect(textarea().disabled).toBe(false);

    await type('flats in Aberdeen');
    await press('Enter');
    expect(questions()).toEqual(['3 bed homes in Ellon', 'flats in Aberdeen']);
  });

  it('clears the page on New conversation', async () => {
    await type('3 bed homes in Ellon');
    await press('Enter');
    sent[0]?.send(...PROPERTIES_STREAM);
    await render();
    const firstSession = sent[0]?.request.sessionId;

    button('New conversation').click();
    await render();

    expect(host.querySelectorAll('hs-chat-turn-view')).toHaveLength(0);
    expect(host.textContent).toContain('Ask your first question');

    await type('flats in Aberdeen');
    await press('Enter');
    expect(sent[1]?.request.sessionId).not.toBe(firstSession);
  });
});
