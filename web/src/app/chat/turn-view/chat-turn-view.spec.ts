import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { PIPELINE_STAGE_LABELS } from '../../config/pipeline-stage/pipeline-stage';
import { PropertyCardList } from '../../property/property-card-list/property-card-list';
import type { ChatStreamItem } from '../../resources/chat/chat.resource';
import { AGGREGATE_STREAM, PROPERTIES_STREAM, STRIPPED_ID_STREAM } from '../chat-stream.fixture';
import type { ChatTurn } from '../turn/chat-turn';
import { applyChatItem, startTurn } from '../turn/chat-turn';
import { ChatTurnView } from './chat-turn-view';

const QUESTION = 'flats in Aberdeen with a garden under £250,000';

function after(items: readonly ChatStreamItem[]): ChatTurn {
  return items.reduce(applyChatItem, startTurn(1, QUESTION));
}

@Component({
  imports: [ChatTurnView],
  template: `<hs-chat-turn-view [turn]="turn()" />`,
})
class Host {
  public readonly turn = signal<ChatTurn>(startTurn(1, QUESTION));
}

describe('ChatTurnView', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  async function show(turn: ChatTurn): Promise<void> {
    fixture.componentInstance.turn.set(turn);
    await fixture.whenStable();
  }

  const text = (): string => host.textContent.replace(/\s+/g, ' ');
  const answer = (): HTMLElement => host.querySelector('section[aria-label="Answer"]')!;
  const stageLine = (): string =>
    host.querySelector('hs-spinner')?.parentElement?.textContent.trim() ?? '';

  beforeEach(async () => {
    // jsdom does not lay out, so it has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn<Element['scrollIntoView']>();
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('shows the question', () => {
    expect(text()).toContain(QUESTION);
  });

  it('advances the stage line with the events', async () => {
    const seen: string[] = [];
    for (const count of [0, 1, 2]) {
      await show(after(PROPERTIES_STREAM.slice(0, count)));
      seen.push(stageLine());
    }

    expect(seen).toEqual([
      PIPELINE_STAGE_LABELS.routing,
      PIPELINE_STAGE_LABELS.retrieving,
      `${PIPELINE_STAGE_LABELS.answering ?? ''} from 3 properties`,
    ]);
  });

  it('marks the answer region live, and busy only while it streams', async () => {
    expect(answer().getAttribute('aria-live')).toBe('polite');
    expect(answer().getAttribute('aria-busy')).toBe('true');

    await show(after(PROPERTIES_STREAM));

    expect(answer().hasAttribute('aria-busy')).toBe(false);
    expect(stageLine()).toBe('');
  });

  it('shows placeholder cards while searching, then the cited cards', async () => {
    await show(after(PROPERTIES_STREAM.slice(0, 1)));
    expect(
      host.querySelector('section[aria-label="Cited properties"]')?.getAttribute('aria-busy'),
    ).toBe('true');

    await show(after(PROPERTIES_STREAM));
    expect(host.querySelectorAll('hs-property-card')).toHaveLength(2);
  });

  it('shows no cards for an aggregate', async () => {
    await show(after(AGGREGATE_STREAM));

    expect(host.querySelector('hs-property-card-list')).toBeNull();
  });

  it('shows the error as an alert when the turn fails', async () => {
    await show(
      after([...PROPERTIES_STREAM.slice(0, 2), { type: 'error', message: 'Please try again.' }]),
    );

    expect(host.querySelector('[role="alert"]')?.textContent.trim()).toBe('Please try again.');
  });

  it('sends a citation to its card', async () => {
    await show(after(PROPERTIES_STREAM));
    const list = fixture.debugElement.query(
      (element) => element.componentInstance instanceof PropertyCardList,
    ).componentInstance as PropertyCardList;
    const showCard = vi.spyOn(list, 'showCard');

    host.querySelector<HTMLButtonElement>('button[aria-label="Show property P-663"]')!.click();

    expect(showCard).toHaveBeenCalledWith('663');
    expect(document.activeElement?.id).toBe('property-663');
  });

  it('never links an id the final citations leave out, at any point of the stream', async () => {
    const buttonNames: string[] = [];
    for (const count of STRIPPED_ID_STREAM.keys()) {
      await show(after(STRIPPED_ID_STREAM.slice(0, count + 1)));
      buttonNames.push(
        ...[...host.querySelectorAll('button')].map(
          (button) => button.getAttribute('aria-label') ?? '',
        ),
      );
    }

    expect(buttonNames.filter((name) => name.includes('999999'))).toEqual([]);
    expect(answer().textContent).not.toContain('999999');
    host.querySelector<HTMLButtonElement>('button[aria-label="Show property P-523"]')!.click();
    expect(document.activeElement?.id).toBe('property-523');
  });

  it('shows no citation links when the turn fails before its citations', async () => {
    await show(
      after([...PROPERTIES_STREAM.slice(0, -2), { type: 'error', message: 'Please try again.' }]),
    );

    expect(answer().textContent).toContain('[P-523]');
    expect(answer().querySelectorAll('button')).toHaveLength(0);
  });
});
