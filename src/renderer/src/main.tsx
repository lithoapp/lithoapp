import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

import { ErrorBoundary } from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initRendererSentry } from '@/lib/sentry';
import { App } from './App';

async function initTheme(): Promise<void> {
  const theme = await window.litho.preferences.getTheme();

  function applyTheme(isDark: boolean): void {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }

  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(isDark);
  } else {
    applyTheme(theme === 'dark');
  }

  window.litho.preferences.onThemeChange((value) => {
    applyTheme(value === 'dark');
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary fallback={<p>Something went wrong. Please restart Litho.</p>}>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </ErrorBoundary>
  </StrictMode>,
);

void initRendererSentry();
void initTheme();
