import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadRuntimeConfig } from './app/runtime-config/load-runtime-config';
import { provideRuntimeConfig } from './app/runtime-config/runtime-config';

const STARTUP_FAILURE_MESSAGE = 'HomeSage could not start. Please try again later.';

/** Replaces the empty root with a message, so a failed start is never a blank page. */
function showStartupFailure(): void {
  const root = document.querySelector('hs-root');
  if (!root) {
    return;
  }
  root.setAttribute('role', 'alert');
  root.textContent = STARTUP_FAILURE_MESSAGE;
}

async function start(): Promise<void> {
  const runtimeConfig = await loadRuntimeConfig((input, init) => fetch(input, init));
  await bootstrapApplication(App, {
    ...appConfig,
    providers: [...appConfig.providers, provideRuntimeConfig(runtimeConfig)],
  });
}

start().catch((error: unknown) => {
  console.error(error);
  showStartupFailure();
});
