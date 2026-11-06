import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import type { ControlSize } from '../theme/size';
import { Input } from './input';
import { INPUT_CLASSES } from './input-classes';

@Component({
  imports: [Input, ReactiveFormsModule],
  template: `
    <hs-input
      label="Your question"
      [hint]="hint()"
      [error]="error()"
      [multiline]="multiline()"
      [size]="size()"
      [formControl]="question"
    />
  `,
})
class Host {
  public readonly hint = signal<string | undefined>(undefined);
  public readonly error = signal<string | undefined>(undefined);
  public readonly multiline = signal(false);
  public readonly size = signal<ControlSize>('md');
  public readonly question = new FormControl('', { nonNullable: true });
}

describe('Input', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  const render = async (): Promise<void> => {
    await fixture.whenStable();
  };
  const field = (): HTMLInputElement | HTMLTextAreaElement => {
    const label = [...host.querySelectorAll('label')].find(
      (element) => element.textContent.trim() === 'Your question',
    )!;
    return host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${label.htmlFor}`)!;
  };
  const describedBy = (): string[] =>
    (field().getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await render();
  });

  it('labels its field with the label text', () => {
    expect(field().tagName).toBe('INPUT');
  });

  it.each([
    ['one line', false],
    ['multiline', true],
  ])(
    'describes the %s field with the hint and the error, and marks it invalid',
    async (_mode, multiline) => {
      fixture.componentInstance.multiline.set(multiline);
      await render();

      expect(field().hasAttribute('aria-describedby')).toBe(false);
      expect(field().hasAttribute('aria-invalid')).toBe(false);

      fixture.componentInstance.hint.set('Ask in plain English');
      fixture.componentInstance.error.set('Ask a question first');
      await render();

      const texts = describedBy().map((id) => host.querySelector(`#${id}`)?.textContent.trim());
      expect(texts).toEqual(['Ask in plain English', 'Ask a question first']);
      expect(field().getAttribute('aria-invalid')).toBe('true');
    },
  );

  it('renders a labelled textarea when multiline', async () => {
    fixture.componentInstance.multiline.set(true);
    await render();

    expect(field().tagName).toBe('TEXTAREA');
  });

  it.each([
    ['one line', false],
    ['multiline', true],
  ])(
    'sends text typed in the %s field to the form control and marks it touched on blur',
    async (_mode, multiline) => {
      fixture.componentInstance.multiline.set(multiline);
      await render();

      field().value = '3 bed flats in AB15';
      field().dispatchEvent(new Event('input'));
      field().dispatchEvent(new Event('blur'));

      expect(fixture.componentInstance.question.value).toBe('3 bed flats in AB15');
      expect(fixture.componentInstance.question.touched).toBe(true);
    },
  );

  it('shows a value set on the form control', async () => {
    fixture.componentInstance.question.setValue('cosy flat with a garden');
    await render();

    expect(field().value).toBe('cosy flat with a garden');
  });

  it('follows the disabled state of the form control', async () => {
    fixture.componentInstance.question.disable();
    await render();

    expect(field().disabled).toBe(true);

    fixture.componentInstance.question.enable();
    await render();

    expect(field().disabled).toBe(false);
  });

  it('gives each size a distinct class string', async () => {
    const seen = new Set<string>();
    for (const size of Object.keys(INPUT_CLASSES.size) as ControlSize[]) {
      fixture.componentInstance.size.set(size);
      await render();
      seen.add(field().className);
    }
    expect(seen.size).toBe(Object.keys(INPUT_CLASSES.size).length);
  });
});

@Component({
  imports: [Input],
  template: `<hs-input label="Search" />`,
})
class HostWithoutForm {}

describe('Input without a form control', () => {
  it('can still be typed in and left', async () => {
    const fixture = TestBed.createComponent(HostWithoutForm);
    await fixture.whenStable();
    const field = (fixture.nativeElement as HTMLElement).querySelector('input')!;

    field.value = 'Cults';
    expect(() => {
      field.dispatchEvent(new Event('input'));
      field.dispatchEvent(new Event('blur'));
    }).not.toThrow();
    await fixture.whenStable();

    expect(field.value).toBe('Cults');
  });
});
