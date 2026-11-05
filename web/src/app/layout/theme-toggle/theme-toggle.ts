import { Component, computed, inject } from '@angular/core';

import { Button } from '../../ui/button/button';
import { THEME, ThemePreference } from '../theme/theme-preference';

/** Header control that switches between the light and dark theme. */
@Component({
  selector: 'hs-theme-toggle',
  imports: [Button],
  templateUrl: './theme-toggle.html',
})
export class ThemeToggle {
  private readonly preference = inject(ThemePreference);

  protected readonly isDark = computed(() => this.preference.theme() === THEME.DARK);

  protected toggleTheme(): void {
    this.preference.toggle();
  }
}
