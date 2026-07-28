# Security & Performance Audit Report

Based on a thorough review of the current codebase and execution of security analysis tools, here is an unfiltered assessment of vulnerabilities, performance issues, and security risks in the LyricMap application before going live.

## 🔒 Security Vulnerabilities

### 1. Insecure JWT Storage (High Risk)
**Issue:** In `auth.service.ts`, the admin authentication token (`access_token`) is stored in `localStorage`.
**Risk:** `localStorage` is entirely accessible to any JavaScript running on the page. This makes the application highly susceptible to Cross-Site Scripting (XSS) attacks. If a malicious script is injected (e.g., via a compromised npm package or unsanitized input), attackers can easily read the token and hijack admin sessions.
**Alternative:** Transition to **HttpOnly Secure Cookies**. The FastAPI backend should issue the JWT in a `Set-Cookie` header with `HttpOnly`, `Secure`, and `SameSite=Strict` flags. The Angular frontend should then remove token storage logic and configure its HTTP requests to use `withCredentials: true`.

### 2. Hardcoded Localhost API Endpoints (Critical for Deployment)
**Issue:** The URLs `http://localhost:8000/token` and `http://localhost:8000/locations` are hardcoded as plain strings in `auth.service.ts` and `map-pins.service.ts`.
**Risk:** Once deployed to production, the frontend will attempt to call the user's local machine, completely breaking API connectivity for anyone but the developer. Furthermore, if the site is served over HTTPS and tries to hit a non-HTTPS API, browsers will block the requests due to **Mixed Content** errors.
**Alternative:** Implement Angular `environment` configurations (`environment.ts` and `environment.prod.ts`) to dynamically inject the API Base URL based on whether the app is built for development or production.

### 3. NPM Audit Vulnerabilities (Medium/High Risk)
**Issue:** A background `npm audit` revealed **49 vulnerabilities (29 high, 3 critical)**. These reside primarily in build and development dependencies (like `vite`, `ws`, `tar`, and `tmp`).
**Risk:** While these are dev-dependencies and might not be shipped in the final browser bundle, severe vulnerabilities (like Path Traversal and Arbitrary File Reads in Vite) can be exploited within CI/CD pipelines or locally to compromise the build process or developer machines.
**Alternative:** Run `npm audit fix` and aggressively update your underlying build tools and dependencies to their patched versions. 

### 4. Missing Token Expiration Handling (Low/Medium Risk)
**Issue:** The frontend has no mechanism to determine if the JWT has expired before sending a request. It relies entirely on the HTTP Interceptor (`auth.interceptor.ts`) intercepting a `401 Unauthorized` response.
**Risk:** Can lead to unexpected user experiences where the admin believes they are logged in (UI shows admin panels) until they take a destructive action, which fails and forces a sudden logout.
**Alternative:** Decode the JWT payload on login and check the `exp` (expiration) claim locally. Proactively prompt the user to re-authenticate or use a refresh token before the session dies.

---

## 🚀 Performance Issues

### 1. Blocking App Initialization (Critical UX Impact)
**Issue:** In `app.config.ts`, `MapPinsService.initialize()` is hooked into the `APP_INITIALIZER`.
**Risk:** Angular halts the *entire application bootstrap process* until this initialization finishes. Because `initialize()` waits for a network request to the backend (or a 7-day cache check), if the API is slow or hangs, the user will be staring at a completely blank screen for seconds. This drastically degrades **Time to Interactive (TTI)** and **First Contentful Paint (FCP)**.
**Alternative:** Remove this from `APP_INITIALIZER`. Bootstrap the application instantly, and initialize the map pins data asynchronously inside the Home map component. Show a non-blocking skeleton loader or UI spinner so the app feels instantly responsive.

### 2. Unnecessary Bundle Bloat from Fallback Data (Medium Impact)
**Issue:** The fallback dataset is synchronously imported at the top of `map-pins.service.ts`:
`import mapDataFallback from '../data/rappers_locations_mapped.json';`
**Risk:** Webpack/Vite statically analyzes this and will forcibly bundle this ~57KB JSON file into your primary JavaScript payload. Every user downloads, parses, and holds this file in memory on initial load, even if the backend API is perfectly healthy and the fallback is never utilized.
**Alternative:** Dynamically import the JSON file *only* in the `catchError` block when the API actually fails.
```typescript
// Instead of static import, use:
const mapDataFallback = (await import('../data/rappers_locations_mapped.json')).default;
```
