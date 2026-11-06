import { Component, computed, forwardRef, input, signal } from '@angular/core';
import type { ControlValueAccessor } from '@angular/forms';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ControlSize } from '../theme/size';
import { uniqueId } from '../unique-id';
import { INPUT_CLASSES } from './input-classes';

const DEFAULT_TEXTAREA_ROWS = 3;

/** The one line input types this control supports. */
export type InputType = 'text' | 'search';

/**
 * A labelled text field, one line or multiline, with an optional hint and error.
 * Bind it with a reactive form control; key handling such as Enter to send is
 * left to the feature, since keyboard events bubble out of `hs-input`.
 */
@Component({
  selector: 'hs-input',
  templateUrl: './input.html',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Input), multi: true }],
})
export class Input implements ControlValueAccessor {
  public readonly label = input.required<string>();
  public readonly hint = input<string>();
  /** Shown under the field and announced with it. Set when the value is invalid. */
  public readonly error = input<string>();
  public readonly type = input<InputType>('text');
  public readonly placeholder = input<string>();
  public readonly size = input<ControlSize>('md');
  public readonly multiline = input(false);
  public readonly rows = input(DEFAULT_TEXTAREA_ROWS);
  public readonly disabled = input(false);

  protected readonly classes = INPUT_CLASSES;
  protected readonly controlId = uniqueId('input');
  protected readonly hintId = uniqueId('input-hint');
  protected readonly errorId = uniqueId('input-error');
  protected readonly value = signal('');

  private readonly formDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly invalid = computed(() => Boolean(this.error()));
  protected readonly describedBy = computed(
    () =>
      [this.hint() ? this.hintId : null, this.error() ? this.errorId : null]
        .filter((id) => id !== null)
        .join(' ') || null,
  );
  protected readonly controlClasses = computed(() =>
    [
      INPUT_CLASSES.control,
      this.invalid() ? INPUT_CLASSES.border.invalid : INPUT_CLASSES.border.valid,
      INPUT_CLASSES.size[this.size()],
    ].join(' '),
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  public writeValue(value: unknown): void {
    this.value.set(typeof value === 'string' ? value : '');
  }

  public registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  public setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  protected update(value: string): void {
    this.value.set(value);
    this.onChange(value);
  }

  protected markTouched(): void {
    this.onTouched();
  }
}
