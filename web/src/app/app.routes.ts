import type { Routes } from '@angular/router';

import { APP_NAME } from './config/brand/brand';
import { AppShell } from './layout/app-shell/app-shell';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      {
        path: '',
        title: APP_NAME,
        loadComponent: () => import('./chat/chat-page').then((module) => module.ChatPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
