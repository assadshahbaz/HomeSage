import { Component, signal, viewChild } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PropertySummary } from '@api/contracts';

import { aPropertySummary } from '../property-summary.fixture';
import { PropertyCardList } from './property-card-list';

const RETRIEVED = [
  aPropertySummary({ id: '3501', address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK' }),
  aPropertySummary({ id: '50', address: 'Flat B, 21 Ashlar Crescent Aberdeen, AB24 3CK' }),
  aPropertySummary({ id: '1244', address: 'Flat A 20 Quillan Street Aberdeen, AB25 2CK' }),
];

@Component({
  imports: [PropertyCardList],
  template: `
    <button type="button">Citation</button>
    <hs-property-card-list
      [citedIds]="citedIds()"
      [properties]="properties()"
      [loading]="loading()"
    />
  `,
})
class Host {
  public readonly citedIds = signal<readonly string[]>(['50', '3501']);
  public readonly properties = signal<readonly PropertySummary[]>(RETRIEVED);
  public readonly loading = signal(false);
  public readonly list = viewChild.required(PropertyCardList);
}

describe('PropertyCardList', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;
  let scrollIntoView: ReturnType<typeof vi.fn<Element['scrollIntoView']>>;

  const render = async (): Promise<void> => {
    await fixture.whenStable();
  };
  const cards = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('hs-property-card')];
  const names = (): (string | null)[] => cards().map((card) => card.getAttribute('aria-label'));
  const region = (): HTMLElement => host.querySelector('section')!;
  // Sorted, because Angular may put a class back in a different position.
  const highlightedClass = (): string[] =>
    cards().map((card) => [...card.querySelector('article')!.classList].sort().join(' '));

  beforeEach(async () => {
    // jsdom does not lay out, so it has no scrollIntoView.
    scrollIntoView = vi.fn<Element['scrollIntoView']>();
    Element.prototype.scrollIntoView = scrollIntoView;
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await render();
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('shows a card for each cited property, in citation order', () => {
    expect(names()).toEqual([
      'Flat B, 21 Ashlar Crescent Aberdeen, AB24 3CK',
      '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
    ]);
  });

  it('never shows a card for a property that was retrieved but not cited', () => {
    expect(names()).not.toContain('Flat A 20 Quillan Street Aberdeen, AB25 2CK');
  });

  it('explains once that only stated features are shown', () => {
    expect(region().textContent).toContain('Only features the listing states are shown');
  });

  it('shows skeletons and marks the region busy while loading', async () => {
    fixture.componentInstance.loading.set(true);
    await render();

    expect(cards()).toEqual([]);
    expect(host.querySelectorAll('hs-skeleton').length).toBeGreaterThan(0);
    expect(region().getAttribute('aria-busy')).toBe('true');
  });

  it('shows an empty state when nothing was cited', async () => {
    fixture.componentInstance.citedIds.set([]);
    await render();

    expect(cards()).toEqual([]);
    expect(region().textContent).toContain('No properties cited');
    expect(region().hasAttribute('aria-busy')).toBe(false);
  });

  it('scrolls to, highlights and focuses the card a citation names', async () => {
    const before = highlightedClass();

    fixture.componentInstance.list().showCard('3501');
    await render();

    const target = cards()[1];
    expect(document.activeElement).toBe(target);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
    expect(highlightedClass()[1]).not.toBe(before[1]);
    expect(highlightedClass()[0]).toBe(before[0]);
  });

  it.each([
    ['smoothly', false, 'smooth'],
    ['instantly under reduced motion', true, 'auto'],
  ])('scrolls %s', (_label, reduce, behavior) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
    }));

    fixture.componentInstance.list().showCard('3501');

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'nearest' });
    vi.unstubAllGlobals();
  });

  it('moves the highlight when another card is shown', async () => {
    fixture.componentInstance.list().showCard('3501');
    await render();
    const firstHighlight = highlightedClass();

    fixture.componentInstance.list().showCard('50');
    await render();

    expect(highlightedClass()).toEqual([...firstHighlight].reverse());
    expect(document.activeElement).toBe(cards()[0]);
  });

  it.each([
    ['an id with no card', '9999'],
    ['a retrieved but uncited id', '1244'],
    ['a malformed id', '12a"]'],
  ])('does nothing for %s', async (_label, id) => {
    const citation = host.querySelector('button')!;
    citation.focus();
    const before = highlightedClass();

    expect(() => {
      fixture.componentInstance.list().showCard(id);
    }).not.toThrow();
    await render();

    expect(document.activeElement).toBe(citation);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(highlightedClass()).toEqual(before);
  });

  it('clears the highlight when a new answer brings new cards', async () => {
    const before = highlightedClass();
    fixture.componentInstance.list().showCard('3501');
    await render();

    fixture.componentInstance.citedIds.set(['50', '3501', '1244']);
    await render();

    expect(highlightedClass().slice(0, 2)).toEqual(before);
  });
});
