import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { MapPinsService } from './services/map-pins.service';
import { AuthService } from './services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: (mapPinsService: MapPinsService) => () => mapPinsService.initialize(),
      deps: [MapPinsService],
      multi: true
    },
    {
      // Verify auth state from the server before any route guard runs.
      // This ensures that after a page refresh, the admin session (stored
      // in the HttpOnly cookie) is correctly reflected in the app's state.
      provide: APP_INITIALIZER,
      useFactory: (authService: AuthService) => () => authService.checkAuthStatus(),
      deps: [AuthService],
      multi: true
    },
    provideRouter(routes), provideClientHydration(withEventReplay())
  ]
};
