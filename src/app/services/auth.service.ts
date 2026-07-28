import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, tap, catchError, of } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_URL = 'http://localhost:8000/token';
  private readonly AUTH_URL = 'http://localhost:8000/auth';
  private loggedInSubject = new BehaviorSubject<boolean>(false);
  public loggedIn$ = this.loggedInSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // One-time migration: remove the legacy localStorage token from before
    // the HttpOnly cookie migration so it doesn't linger in the browser.
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('admin_token');
    }
  }

  /**
   * Verifies the current auth state with the server by hitting GET /auth/me.
   * Used at app startup (APP_INITIALIZER) so the auth guard has accurate state
   * before any route resolves — without reading any token from JavaScript.
   */
  checkAuthStatus(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.resolve();
    }
    return this.http
      .get(`${this.AUTH_URL}/me`, { withCredentials: true })
      .pipe(
        tap(() => this.loggedInSubject.next(true)),
        catchError(() => {
          this.loggedInSubject.next(false);
          return of(null);
        })
      )
      .toPromise()
      .then(() => undefined);
  }

  login(username: string, password: string): Observable<any> {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    // withCredentials: true is required so the browser accepts and stores
    // the HttpOnly Set-Cookie header returned by the backend.
    return this.http.post(this.TOKEN_URL, formData, { withCredentials: true }).pipe(
      tap(() => {
        this.loggedInSubject.next(true);
      })
    );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Ask the backend to clear the HttpOnly cookie — JS cannot do this itself.
      this.http.post(`${this.AUTH_URL}/logout`, {}, { withCredentials: true }).subscribe({
        complete: () => {
          this.loggedInSubject.next(false);
          this.router.navigate(['/login']);
        },
        error: () => {
          // Proceed with client-side logout even if the server call fails.
          this.loggedInSubject.next(false);
          this.router.navigate(['/login']);
        }
      });
    }
  }

  isLoggedIn(): boolean {
    return this.loggedInSubject.value;
  }
}
