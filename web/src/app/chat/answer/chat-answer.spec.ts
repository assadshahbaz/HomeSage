import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { ChatAnswer } from './chat-answer';

@Component({
  imports: [ChatAnswer],
  template: `<hs-chat-answer
    [text]="text()"
    [linkedIds]="linked()"
    [final]="final()"
    (citationSelected)="selected.push($event)"
  />`,
})
class Host {
  public readonly text = signal('');
  public readonly linked = signal<readonly string[]>([]);
  public readonly final = signal(false);
  public readonly selected: string[] = [];
}

describe('ChatAnswer', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  async function show(text: string, linked: readonly string[] = [], final = false): Promise<void> {
    fixture.componentInstance.text.set(text);
    fixture.componentInstance.linked.set(linked);
    fixture.componentInstance.final.set(final);
    await fixture.whenStable();
  }

  const citations = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('shows markdown with a script tag as text, and runs nothing', async () => {
    await show('Two homes.\n\n<script>window.hacked = true</script> <img src=x onerror="1">');

    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<script>window.hacked = true</script>');
  });

  it('renders paragraphs, line breaks and lists', async () => {
    await show('First.\nSecond line.\n\n- one\n- two');

    expect(host.querySelectorAll('p')).toHaveLength(1);
    expect(host.querySelectorAll('br')).toHaveLength(1);
    expect([...host.querySelectorAll('li')].map((item) => item.textContent.trim())).toEqual([
      'one',
      'two',
    ]);
  });

  it('keeps markers as plain text until the final citations name them', async () => {
    await show('A garden [P-1207].');

    expect(citations()).toEqual([]);
    expect(host.textContent).toContain('[P-1207]');
  });

  it('turns a cited marker into a button named for its property, with no stray space', async () => {
    await show('A garden [P-1207].', ['1207']);

    expect(citations().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Show property P-1207',
    ]);
    expect(host.textContent.replace(/\s+/g, ' ').trim()).toBe('A garden P-1207.');
  });

  it('leaves a marker the final citations do not name as text', async () => {
    await show('One [P-1207] and two [P-50].', ['1207']);

    expect(citations()).toHaveLength(1);
    expect(host.textContent).toContain('[P-50]');
  });

  it('removes a marker the final citations leave out', async () => {
    await show('One [P-1207] and two [P-50].', ['1207'], true);

    expect(citations()).toHaveLength(1);
    expect(host.textContent).not.toContain('50');
    expect(host.textContent.replace(/\s+/g, ' ').trim()).toBe('One P-1207 and two.');
  });

  it('says which property each citation names when it is chosen', async () => {
    await show('A [P-1207] and B [P-50].', ['1207', '50']);

    // A native button turns Enter and Space into a click.
    for (const button of citations()) {
      button.click();
    }

    expect(fixture.componentInstance.selected).toEqual(['1207', '50']);
  });
});
