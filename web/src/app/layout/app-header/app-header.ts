import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_NAME } from '../../config/brand/brand';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

/** Top bar of every page: the product name and the theme toggle. */
@Component({
  selector: 'hs-app-header',
  imports: [RouterLink, ThemeToggle],
  templateUrl: './app-header.html',
})
export class AppHeader {
  protected readonly appName = APP_NAME;
}
