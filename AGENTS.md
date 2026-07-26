# Playbook for AI Coding Agents: LyricMap Web App

Welcome! This document provides architecture details, key development constraints, structure outlines, and CLI commands to guide any agent working on this frontend repository.

---

## ⚠️ CRITICAL ARCHITECTURE RULES

### 1. Leaflet & Server-Side Rendering (SSR)
This project is configured with Angular Server-Side Rendering (SSR). Leaflet (`leaflet` and `leaflet.markercluster`) relies on browser globals (`window`, `document`, `navigator`). 
* **DO NOT** import Leaflet globally or statically at the top of components or services.
* **MUST** dynamically import Leaflet and its plugins only when running in the browser using the `isPlatformBrowser(platformId)` check.
* Typically, Leaflet should be initialized inside `ngAfterViewInit()`.

**Correct Pattern (from [home.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/pages/home/home.ts)):**
```typescript
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// In your component:
private platformId = inject(PLATFORM_ID);

async ngAfterViewInit(): Promise<void> {
  if (isPlatformBrowser(this.platformId)) {
    const Leaflet = await import('leaflet');
    const L = (Leaflet as any).default || Leaflet;
    (window as any).L = L;
    
    await import('leaflet.markercluster');
    const leafletWithPlugins = (window as any).L;
    
    // Now you can safely use Leaflet
    this.initMap(leafletWithPlugins);
  }
}
```

### 2. Stylesheets Loading
Leaflet's stylesheet is bundled globally. It is configured in [angular.json](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/angular.json) under `architect.build.options.styles` as `node_modules/leaflet/dist/leaflet.css`. Do not manually `@import` it in individual component stylesheets.

### 3. Caching and Fallbacks
The [MapPinsService](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/services/map-pins.service.ts) caches coordinate pins in the browser's `localStorage` for **7 days** to minimize database/API round-trips. If the API is unreachable, it automatically falls back to the local seed file: [rappers_locations_mapped.json](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/data/rappers_locations_mapped.json).

---

## 🛠️ Common Developer Tasks & Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
To run the server in development mode (CSR only):
```bash
npm start
```
To run development mode with Server-Side Rendering (SSR) & hot-reload:
```bash
npm run dev:ssr
```
The application will run by default on `http://localhost:4200/`.

### 3. Build for Production
To compile and optimize the client and server bundles:
```bash
npm run build
```
This generates output inside `dist/lyric-map-app/`.

### 4. Running Unit Tests
To run unit tests using Karma and Jasmine:
```bash
npm run test
```

---

## 📂 Project Structure

* `angular.json`: Angular project build, styles, SSR, and asset configs.
* `package.json`: NPM package dependencies. Contains Leaflet, MarkerCluster, Express (for SSR host), and dev tools.
* `tsconfig.json` & `tsconfig.app.json`: Typescript compiler settings.
* `src/`:
  * `main.ts`: Client-side bootstrap entrypoint.
  * `main.server.ts`: Server-side bootstrap entrypoint for SSR.
  * `server.ts`: Express server configuration used to host the SSR app.
  * `styles.scss`: Global styling (premium glassmorphism variables, dark theme base).
  * `app/`:
    * [app.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/app.ts): Main root application component.
    * [app.html](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/app.html): Shell layout featuring `<router-outlet>` wrapper and navigation header.
    * [app.config.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/app.config.ts): App configuration supplying HTTP Client (with SSR hydration, fetch, interceptor) and `MapPinsService` initializer.
    * [app.routes.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/app.routes.ts): Route registry mapping layout endpoints.
    * `data/`:
      * [rappers_locations_mapped.json](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/data/rappers_locations_mapped.json): Local backup seed containing coordinate details.
    * `guards/`:
      * [auth.guard.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/guards/auth.guard.ts): Router guard to block anonymous requests to admin views.
    * `interceptors/`:
      * [auth.interceptor.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/interceptors/auth.interceptor.ts): HTTP interceptor that injects Bearer JWT and handles 401 errors by logging out.
    * `services/`:
      * [auth.service.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/services/auth.service.ts): Handles credentials validation and stores security tokens.
      * [map-pins.service.ts](file:///c:/Users/orest/Downloads/LyricMapWebsite/lyric-map-app/src/app/services/map-pins.service.ts): Controls fetching, caching, filtering, and updating coordinate records.
    * `pages/`:
      * `home/`: Leaflet map view with artist filters sidebar.
      * `insights/`: Statistical analytics dashboard (most mentioned cities, top rappers, international metrics).
      * `about/` / `contact/`: Generic informational view templates.
      * `login/`: Authentication form page.
      * `admin/location-management/`: Dashboard for administrative coordinate adjustment and overrides.

---

## ⚙️ Services & API Integration

This application interacts with a companion FastAPI backend service (usually running on `http://localhost:8000`).

### 1. MapPinsService
* **Base URL**: `http://localhost:8000/locations`
* **Initialization (`initialize()`)**: Triggered at application startup using `APP_INITIALIZER`. Checks local cache. If invalid or empty, fetches fresh pins. Falls back to static file if FastAPI is offline.
* **Filter Pipeline**: Exposes `pins$`, `artists$`, and `filteredPins$` as observables to drive map markers and filter dropdowns.
* **Update Coordinates (`updateLocation(id, lat, lng)`)**:
  * Endpoint: `PUT http://localhost:8000/locations/:id`
  * Action: Updates map coordinates for specific location records, automatically setting `is_manual` to `true`.
  * Security: Requires administrative privileges (interceptor appends the bearer token).

### 2. AuthService
* **Base URL**: `http://localhost:8000/token`
* **Credentials Action (`login(username, password)`)**: Form-data submission to fetch an administrative JWT (`access_token`).
* **Session Storage**: Saves JWT to `localStorage` under `admin_token`.

---

## 🔒 Security & Router Protection

1. **Authentication Guard**: `/admin/locations` is protected by `authGuard`. If a user is not authenticated, they are redirected to `/login`.
2. **Bearer Interceptor**: `authInterceptor` intercepts every outgoing HTTP request. If an `admin_token` exists in `localStorage`, it attaches:
   ```http
   Authorization: Bearer <token>
   ```
3. **Session Expiration**: If any HTTP request receives a `401 Unauthorized` response, the interceptor automatically calls `AuthService.logout()`, clearing the token and redirecting the client to `/login`.
