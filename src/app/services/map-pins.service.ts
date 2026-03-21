import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, combineLatest } from 'rxjs';
import { catchError, map, tap, shareReplay } from 'rxjs/operators';
import mapDataFallback from '../data/rappers_locations_mapped.json';

export interface LocationData {
  id: number;
  artist: string;
  location: string;
  song: string;
  lat: number;
  lng: number;
  is_manual: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MapPinsService {
  private readonly API_URL = 'http://localhost:8000/locations';
  private readonly REFRESH_INTERVAL_DAYS = 7;
  private readonly STORAGE_KEY = 'lastMapPinRefresh';
  private readonly CACHE_KEY = 'cachedMapPins';

  private pinsSubject = new BehaviorSubject<LocationData[]>([]);
  public pins$ = this.pinsSubject.asObservable();

  private selectedArtistsSubject = new BehaviorSubject<string[]>([]);
  public selectedArtists$ = this.selectedArtistsSubject.asObservable();

  public artists$ = this.pins$.pipe(
    map(pins => {
      const artists = Array.from(new Set(pins.map(p => p.artist))).sort();
      return artists;
    }),
    shareReplay(1)
  );

  public filteredPins$ = combineLatest([this.pins$, this.selectedArtists$]).pipe(
    map(([pins, selectedArtists]) => {
      if (selectedArtists.length === 0) return pins;
      return pins.filter(p => selectedArtists.includes(p.artist));
    }),
    shareReplay(1)
  );

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  public async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.pinsSubject.next(mapDataFallback as LocationData[]);
      return;
    }

    try {
      const lastRefresh = localStorage.getItem(this.STORAGE_KEY);
      const now = new Date().getTime();
      const msPerDay = 24 * 60 * 60 * 1000;

      const needsRefresh = !lastRefresh || 
                           (now - parseInt(lastRefresh, 10)) > (this.REFRESH_INTERVAL_DAYS * msPerDay) ||
                           this.pinsSubject.value.length === 0;

      if (needsRefresh) {
        console.log('[MapPinsService] Needs refresh. Fetching from API...');
        await new Promise<void>((resolve) => {
          this.refreshPins().subscribe({
            next: (data) => {
              console.log('[MapPinsService] Initial refresh complete. Pins count:', data.length);
              resolve();
            },
            error: (err) => {
              console.error('[MapPinsService] Initial refresh failed:', err);
              if (this.pinsSubject.value.length === 0) {
                this.pinsSubject.next(mapDataFallback as LocationData[]);
              }
              resolve(); 
            }
          });
        });
      } else {
        console.log('[MapPinsService] Cache valid. Loading from storage...');
        const cachedData = localStorage.getItem(this.CACHE_KEY);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.pinsSubject.next(parsed);
            } else {
              console.log('[MapPinsService] Cache empty or invalid, triggering refresh.');
              await this.initializeForceRefresh();
            }
          } catch (e) {
            console.error('Failed to parse cached pins, falling back to local file.', e);
            this.pinsSubject.next(mapDataFallback as LocationData[]);
          }
        } else {
          this.pinsSubject.next(mapDataFallback as LocationData[]);
        }
      }
    } catch (e) {
      console.error('MapPinsService initialize error:', e);
      this.pinsSubject.next(mapDataFallback as LocationData[]);
    }
  }

  private async initializeForceRefresh(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.refreshPins().subscribe({
        next: () => resolve(),
        error: () => {
          this.pinsSubject.next(mapDataFallback as LocationData[]);
          resolve();
        }
      });
    });
  }

  public refreshPins(): Observable<LocationData[]> {
    return this.http.get<any>(this.API_URL).pipe(
      map(data => this.processData(data)),
      tap(processedData => {
        console.log(`[MapPinsService] Successfully processed ${processedData.length} map pins.`);
        this.pinsSubject.next(processedData);
        if (isPlatformBrowser(this.platformId) && processedData.length > 0) {
          try {
            localStorage.setItem(this.STORAGE_KEY, new Date().getTime().toString());
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(processedData));
          } catch (e) {
            console.warn('Failed to save pins to localStorage:', e);
          }
        }
      }),
      catchError(error => {
        console.warn('API fetch failed, falling back to local data.', error);
        const fallback = mapDataFallback as LocationData[];
        this.pinsSubject.next(fallback);
        return of(fallback);
      })
    );
  }

  private processData(data: any): LocationData[] {
    if (!data) return [];
    
    console.log('[MapPinsService] Raw data type:', Array.isArray(data) ? 'Array' : typeof data);
    
    const mappedData: LocationData[] = [];
    
    // CASE 1: Array format
    if (Array.isArray(data)) {
      data.forEach(item => {
        // Sub-case A: Flat pin object {location, lat, lng, artist, song}
        if (item.lat != null && item.lng != null) {
          mappedData.push(this.formatPin(item.artist, item));
        }
        // Sub-case B: Artist object with mentions [{artist, mentions: [...]}]
        else if (item.mentions && Array.isArray(item.mentions)) {
          item.mentions.forEach((m: any) => {
            if (m.lat != null && m.lng != null) {
              mappedData.push(this.formatPin(item.artist, m));
            }
          });
        }
      });
      console.log('[MapPinsService] Processed array. Result count:', mappedData.length);
      return mappedData;
    }

    // CASE 2: Object keyed by artist
    console.log('[MapPinsService] Data is object. Iterating keys...');
    for (const artist in data) {
      const entries = data[artist];
      if (Array.isArray(entries)) {
        for (const item of entries) {
          if (item.lat != null && item.lng != null) {
            mappedData.push(this.formatPin(artist, item));
          }
        }
      }
    }

    return mappedData;
  }

  public setSelectedArtists(artists: string[]): void {
    this.selectedArtistsSubject.next(artists);
  }

  public getSelectedArtists(): string[] {
    return this.selectedArtistsSubject.value;
  }

  private formatPin(artist: string | undefined, item: any): LocationData {
    // Add a very slight random offset to prevent exact overlapping pins on the map
    const offsetLat = (Math.random() - 0.5) * 0.002;
    const offsetLon = (Math.random() - 0.5) * 0.002;

    return {
      id: item.id || 0,
      artist: artist || item.artist || 'Unknown',
      location: item.location || 'Unknown',
      song: item.song || 'Unknown',
      lat: Number(item.lat) + offsetLat,
      lng: Number(item.lng) + offsetLon,
      is_manual: !!item.is_manual
    };
  }

  public updateLocation(id: number, lat: number, lng: number): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, { lat, lng }).pipe(
      tap(() => {
        // Update local state
        const currentPins = this.pinsSubject.value;
        const index = currentPins.findIndex(p => p.id === id);
        if (index !== -1) {
          const updatedPins = [...currentPins];
          updatedPins[index] = { ...updatedPins[index], lat, lng, is_manual: true };
          this.pinsSubject.next(updatedPins);
          
          // Update cache
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(updatedPins));
          }
        }
      })
    );
  }
}
