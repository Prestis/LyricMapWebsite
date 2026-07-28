import { Component, AfterViewInit, PLATFORM_ID, Inject, OnDestroy, inject, NgZone } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { MapPinsService, LocationData } from '../../services/map-pins.service';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { ReportIssueModalComponent } from '../../components/report-issue-modal/report-issue-modal.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ReportIssueModalComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements AfterViewInit, OnDestroy {
  private map: any;
  private markerClusterGroup: any;
  private pinsSubscription: Subscription | undefined;
  private mapPinsService = inject(MapPinsService);
  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);

  public artists$ = this.mapPinsService.artists$;
  public totalArtists$ = this.artists$.pipe(map(artists => artists.length));
  public totalSongs$ = this.mapPinsService.pins$.pipe(map(pins => new Set(pins.map(p => p.song)).size));
  public selectedArtists: string[] = [];
  public isFilterOpen = false;

  public isReportModalOpen = false;
  public reportLocationId = 0;
  public reportLocationName = '';

  constructor() { }

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      // Dynamic import to prevent SSR issues with Leaflet
      const Leaflet = await import('leaflet');
      // Some builders export Leaflet as 'default', others as the module itself
      const L = (Leaflet as any).default || Leaflet;

      (window as any).L = L;

      // @ts-ignore
      await import('leaflet.markercluster');

      // Use the L from window to ensure all plugins are attached
      const leafletWithPlugins = (window as any).L;
      this.initMap(leafletWithPlugins);

      console.log('[Home] Map and MarkerCluster initialized');

      // Subscribe to filtered map pins from service
      this.pinsSubscription = this.mapPinsService.filteredPins$.subscribe(pins => {
        console.log('[Home] Received filtered pins. Count:', pins.length);
        this.updateMapPins(leafletWithPlugins, pins);
      });
      
      // Keep track of selected artists locally for the UI
      this.mapPinsService.selectedArtists$.subscribe(artists => {
        this.selectedArtists = artists;
      });

      // Event delegation for report buttons inside Leaflet popups
      const mapContainer = document.getElementById('map');
      if (mapContainer) {
        mapContainer.addEventListener('click', (e: Event) => {
          const target = e.target as HTMLElement;
          const reportBtn = target.closest('.report-issue-btn');
          if (reportBtn) {
            const id = reportBtn.getAttribute('data-id');
            const name = reportBtn.getAttribute('data-name');
            if (id && name) {
              this.ngZone.run(() => {
                this.openReportModal(Number(id), name);
              });
            }
          }
        });
      }
    }
  }

  ngOnDestroy(): void {
    if (this.pinsSubscription) {
      this.pinsSubscription.unsubscribe();
    }
  }

  private initMap(L: any): void {
    // Default location (e.g., Greece/Athens focus)
    this.map = L.map('map').setView([37.9838, 23.7275], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);

    // Initialize Marker Cluster Group
    // @ts-ignore
    this.markerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: false,
      chunkedLoading: true,
      disableClusteringAtZoom: 10
    });
    this.map.addLayer(this.markerClusterGroup);
  }

  private updateMapPins(L: any, pins: LocationData[]): void {
    if (!this.map || !pins || pins.length === 0 || !this.markerClusterGroup) return;

    // Clear existing clusters/markers
    this.markerClusterGroup.clearLayers();

    const markers: any[] = [];
    const groups: { [key: string]: { lat: number; lng: number; location: string; mentions: LocationData[] } } = {};

    // Group pins by their normalized location name, fallback to coordinates
    pins.forEach((point: LocationData) => {
      if (point.lat == null || point.lng == null) return;
      
      let key = this.mapPinsService.normalizeLocationName(point.location);
      if (!key || key === 'unknown') {
        key = `${point.lat}_${point.lng}`;
      }
      
      if (!groups[key]) {
        groups[key] = {
          lat: point.lat,
          lng: point.lng,
          location: point.location || 'Unknown',
          mentions: []
        };
      }
      groups[key].mentions.push(point);
    });

    // Create a marker for each unique coordinate group
    Object.values(groups).forEach((group) => {
      const mentionsCount = group.mentions.length;
      let mentionsHtml = '';

      group.mentions.forEach((m) => {
        const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(m.artist + ' ' + m.song)}`;
        mentionsHtml += `
          <div class="popup-mention-item">
            <div class="popup-mention-info">
              <div class="popup-artist">${m.artist}</div>
              <div class="popup-song">"${m.song}"</div>
            </div>
            <div class="popup-mention-actions">
              <button class="popup-link report-issue-btn" data-id="${m.id}" data-name="${m.location}" title="Report incorrect location">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM12 17.3c-.72 0-1.3-.58-1.3-1.3 0-.72.58-1.3 1.3-1.3.72 0 1.3.58 1.3 1.3 0 .72-.58 1.3-1.3 1.3zm1-4.3h-2V7h2v6z"/></svg>
              </button>
              <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" class="popup-link spotify-link" title="Listen on Spotify">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.894-.982-.336.076-.67-.135-.746-.472-.076-.336.135-.67.472-.746 3.856-.882 7.15-.502 9.822 1.133.295.18.387.565.207.86zm1.225-2.72c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.076-1.183-.412.125-.845-.107-.97-.52-.125-.413.108-.846.52-.971 3.67-1.113 8.24-.567 11.34 1.34.367.227.487.708.26 1.074zm.106-2.833C14.384 8.78 8.463 8.583 5.033 9.625c-.526.16-1.082-.143-1.242-.67-.16-.527.143-1.082.67-1.242 3.93-1.193 10.485-.967 14.55 1.448.473.28.627.893.347 1.366-.28.473-.893.627-1.366.347z"/></svg>
              </a>
            </div>
          </div>
        `;
      });

      const marker = L.circleMarker([group.lat, group.lng], {
        color: '#ccff00',
        radius: 6,
        fillOpacity: 0.8,
        weight: 2
      }).bindPopup(`
          <div class="custom-popup">
            <div class="popup-location-header">
              <div class="popup-location">${group.location}</div>
              <span class="popup-badge">${mentionsCount} ${mentionsCount === 1 ? 'mention' : 'mentions'}</span>
            </div>
            <div class="popup-mentions-list">
              ${mentionsHtml}
            </div>
          </div>
        `, {
        className: 'premium-popup'
      });

      markers.push(marker);
    });

    this.markerClusterGroup.addLayers(markers);
  }

  public toggleArtist(artist: string): void {
    const current = [...this.selectedArtists];
    const index = current.indexOf(artist);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(artist);
    }
    this.mapPinsService.setSelectedArtists(current);
  }

  public isArtistSelected(artist: string): boolean {
    return this.selectedArtists.includes(artist);
  }

  public clearFilters(): void {
    this.mapPinsService.setSelectedArtists([]);
  }

  public toggleFilterDropdown(): void {
    this.isFilterOpen = !this.isFilterOpen;
  }

  public openReportModal(id: number, name: string): void {
    this.reportLocationId = id;
    this.reportLocationName = name;
    this.isReportModalOpen = true;
  }

  public closeReportModal(): void {
    this.isReportModalOpen = false;
  }
}
