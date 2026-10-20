import { DATE_PIPE_DEFAULT_OPTIONS, registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

registerLocaleData(localeEsCO);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Fechas y números en español de Colombia; horas siempre en hora de Colombia
    // (UTC-5), aunque el dispositivo tenga otra zona horaria configurada.
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { timezone: '-0500', dateFormat: 'd MMM, h:mm a' } },
  ],
};
