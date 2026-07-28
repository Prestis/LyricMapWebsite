import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Observable, catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);

  // Attach credentials (HttpOnly cookie) to every outgoing request.
  // This replaces the old "Authorization: Bearer <token>" header approach.
  const reqWithCredentials = req.clone({ withCredentials: true });

  return next(reqWithCredentials).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only treat a 401 as a session expiry if the user was already believed
      // to be logged in. Without this guard, the startup /auth/me check (which
      // returns 401 for anonymous users) would trigger a spurious redirect to /login.
      if (error.status === 401 && authService.isLoggedIn()) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
