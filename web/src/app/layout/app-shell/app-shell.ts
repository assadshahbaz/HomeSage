import type { ElementRef } from '@angular/core';
import { Component, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppHeader } from '../app-header/app-header';

/** Layout route around every page: skip link, header and the main region. */
@Component({
  selector: 'hs-app-shell',
  imports: [AppHeader, RouterOutlet],
  templateUrl: './app-shell.html',
})
export class AppShell {
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  // Moving focus by hand, because a `#main` href would go through the router
  // and navigate to the root route from any other page.
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }
}
