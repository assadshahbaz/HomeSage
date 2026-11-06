import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { Drawer } from './drawer';

// jsdom's <dialog> has no showModal() or close(). These stand ins keep the open
// attribute and the close event the way a browser does; focus trapping, Escape
// and focus return are the browser's and are checked in a real one.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
});

@Component({
  imports: [Drawer],
  template: `
    <hs-drawer heading="Under the hood" [(open)]="open">
      <p>Intent: hybrid</p>
    </hs-drawer>
  `,
})
class Host {
  public readonly open = signal(false);
}

describe('Drawer', () => {
  let fixture: ComponentFixture<Host>;
  let dialog: HTMLDialogElement;

  const render = async (): Promise<void> => {
    await fixture.whenStable();
  };
  const isOpen = (): boolean => dialog.hasAttribute('open');

  beforeEach(async () => {
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
    fixture = TestBed.createComponent(Host);
    await render();
    dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  });

  afterEach(() => {
    const prototype: Partial<HTMLDialogElement> = HTMLDialogElement.prototype;
    delete prototype.showModal;
    delete prototype.close;
    vi.clearAllMocks();
  });

  it('is closed until open is set, then opens as a modal', async () => {
    expect(isOpen()).toBe(false);

    fixture.componentInstance.open.set(true);
    await render();

    expect(isOpen()).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('is labelled by its heading and shows its content', () => {
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby')!);

    expect(heading?.textContent.trim()).toBe('Under the hood');
    expect(dialog.textContent).toContain('Intent: hybrid');
  });

  it('closes when open is cleared', async () => {
    fixture.componentInstance.open.set(true);
    await render();
    fixture.componentInstance.open.set(false);
    await render();

    expect(isOpen()).toBe(false);
  });

  it('clears open from the close button', async () => {
    fixture.componentInstance.open.set(true);
    await render();

    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await render();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('clears open when the dialog closes itself, as it does on Escape', async () => {
    fixture.componentInstance.open.set(true);
    await render();

    dialog.close();
    await render();

    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    fixture.componentInstance.open.set(true);
    await render();

    dialog.querySelector('p')!.click();
    await render();
    expect(fixture.componentInstance.open()).toBe(true);

    dialog.click();
    await render();
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
