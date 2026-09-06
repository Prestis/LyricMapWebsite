import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';

export interface Report {
  id: number;
  location_id: number;
  location_name: string;
  song: string;
  artist: string;
  report_type: string;
  suggestion?: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private readonly API_URL = `${environment.apiUrl}/reports`;
  private readonly STORAGE_KEY = 'lyric_map_reports_count';
  private readonly DATE_KEY = 'lyric_map_reports_date';
  private readonly MAX_REPORTS_PER_DAY = 5;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  public submitReport(locationId: number, type: 'fictional' | 'suggestion', suggestion?: string): Observable<any> {
    if (!isPlatformBrowser(this.platformId)) {
        return throwError(() => new Error('Cannot submit report from server'));
    }

    if (!this.checkRateLimit()) {
      return throwError(() => new Error('Rate limit exceeded. You can only submit 5 reports per day.'));
    }

    return this.http.post(this.API_URL, {
      location_id: locationId,
      report_type: type,
      suggestion: suggestion
    }).pipe(
      tap(() => this.incrementRateLimit())
    );
  }

  public getReports(): Observable<Report[]> {
    return this.http.get<Report[]>(this.API_URL);
  }

  public resolveReport(reportId: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${reportId}`);
  }

  private checkRateLimit(): boolean {
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem(this.DATE_KEY);
    
    if (storedDate !== today) {
      localStorage.setItem(this.DATE_KEY, today);
      localStorage.setItem(this.STORAGE_KEY, '0');
      return true;
    }

    const count = parseInt(localStorage.getItem(this.STORAGE_KEY) || '0', 10);
    return count < this.MAX_REPORTS_PER_DAY;
  }

  private incrementRateLimit(): void {
    const count = parseInt(localStorage.getItem(this.STORAGE_KEY) || '0', 10);
    localStorage.setItem(this.STORAGE_KEY, (count + 1).toString());
  }
}
