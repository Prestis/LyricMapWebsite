import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { MapPinsService } from './services/map-pins.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withFetch()),
    {
      provide: APP_INITIALIZER,
      useFactory: (mapPinsService: MapPinsService) => () => mapPinsService.initialize(),
      deps: [MapPinsService],
      multi: true
    },
    provideRouter(routes), provideClientHydration(withEventReplay())
  ]
};
