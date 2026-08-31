import * as Sentry from '@sentry/electron/renderer';

declare const __APP_VERSION__: string | undefined;
declare const __SENTRY_DSN__: string;

const DSN = __SENTRY_DSN__;

let isAutomaticTelemetryEnabled = true;

export async function initRendererSentry(): Promise<void> {
  if (!DSN) return;

  isAutomaticTelemetryEnabled = await window.litho.telemetry.getEnabled().catch(() => true);

  Sentry.init({
    dsn: DSN,
    release: typeof __APP_VERSION__ !== 'undefined' ? `lithoapp@${__APP_VERSION__}` : undefined,
    sendDefaultPii: false,
    integrations: [
      Sentry.breadcrumbsIntegration({ console: false }),
      Sentry.feedbackIntegration({
        autoInject: false,
        showBranding: false,
        enableScreenshot: false,
        colorScheme: 'system',
      }),
    ],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http' && breadcrumb.data?.url) {
        breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
      }
      return breadcrumb;
    },
    beforeSend(event) {
      return isAutomaticTelemetryEnabled || event.type === 'feedback' ? event : null;
    },
  });

  const profile = await window.litho.preferences.getUserProfile().catch(() => ({
    name: null,
    email: null,
  }));
  syncRendererSentryUser(profile);
}

export function setRendererSentryTelemetryEnabled(value: boolean): void {
  isAutomaticTelemetryEnabled = value;
}

export function syncRendererSentryUser(profile: {
  name: string | null;
  email: string | null;
}): void {
  if (!profile.name && !profile.email) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    name: profile.name ?? undefined,
    username: profile.name ?? undefined,
    email: profile.email ?? undefined,
  });
}
