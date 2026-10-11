import {
  Component,
  AfterViewInit,
  OnDestroy,
  OnInit,
  inject,
  NgZone,
  ChangeDetectorRef,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapPinsService, LocationData, AreaDefinition } from '../../services/map-pins.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AspectRatio = 'a3-portrait' | 'square' | 'story' | 'a4-landscape';
export type LabelDensity = 'top' | 'all' | 'minimal';
export type ThemeId = 'midnight' | 'gallery' | 'blueprint' | 'vintage';

export interface PosterTheme {
  id: ThemeId;
  name: string;
  tagline: string;
  bgColor: string;
  frameBorderColor: string;
  textColor: string;
  subtextColor: string;
  accentColor: string;
  tileLayer: 'dark' | 'light';
  palette: string[];
}

interface ArtistColor {
  artist: string;
  color: string;
  selected: boolean;
}

interface PinGroup {
  lat: number;
  lng: number;
  location: string;
  mentions: LocationData[];
  jitteredLat: number;
  jitteredLng: number;
}

export const POSTER_THEMES: PosterTheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'LyricMap Lime & Cyan',
    bgColor: '#0c0d12',
    frameBorderColor: '#262936',
    textColor: '#f8fafc',
    subtextColor: '#94a3b8',
    accentColor: '#ccff00',
    tileLayer: 'dark',
    palette: [
      '#ccff00', '#00e5ff', '#99f6e4', '#a3e635',
      '#38bdf8', '#86efac', '#22d3ee', '#d9f99d'
    ]
  },
  {
    id: 'gallery',
    name: 'Gallery Paper',
    tagline: 'Archival Cream & Ink',
    bgColor: '#f8f5ee',
    frameBorderColor: '#d6d1c4',
    textColor: '#18181b',
    subtextColor: '#52525b',
    accentColor: '#18181b',
    tileLayer: 'light',
    palette: [
      '#18181b', '#27272a', '#3f3f46', '#52525b',
      '#09090b', '#71717a'
    ]
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    tagline: 'Architectural Cyan',
    bgColor: '#081426',
    frameBorderColor: '#1e3a5f',
    textColor: '#f0f9ff',
    subtextColor: '#7dd3fc',
    accentColor: '#00e5ff',
    tileLayer: 'dark',
    palette: [
      '#00e5ff', '#38bdf8', '#7dd3fc', '#bae6fd',
      '#0284c7', '#0ea5e9'
    ]
  },
  {
    id: 'vintage',
    name: 'Espresso',
    tagline: 'Warm Retro Sepia',
    bgColor: '#171311',
    frameBorderColor: '#3a2e28',
    textColor: '#fef3c7',
    subtextColor: '#d97706',
    accentColor: '#f59e0b',
    tileLayer: 'dark',
    palette: [
      '#f59e0b', '#fbbf24', '#d97706', '#b45309',
      '#fcd34d', '#ca8a04'
    ]
  }
];

@Component({
  selector: 'app-poster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './poster.html',
  styleUrl: './poster.scss'
})
export class Poster implements OnInit, AfterViewInit, OnDestroy {
  private mapPinsService = inject(MapPinsService);
  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  // Area Selection
  public availableAreas: { area: AreaDefinition; count: number }[] = [];
  public selectedArea: AreaDefinition | null = null;

  // Themes
  public readonly themes = POSTER_THEMES;
  public currentTheme: PosterTheme = POSTER_THEMES[0];

  // Artist Filter
  public artistColors: ArtistColor[] = [];
  public isArtistFilterOpen = false;

  // Density & Camera
  public labelDensity: LabelDensity = 'top';
  public isMapLocked = true;

  // Aspect Ratio
  public aspectRatio: AspectRatio = 'a3-portrait';
  public readonly aspectRatioOptions: { value: AspectRatio; label: string; badge: string }[] = [
    { value: 'a3-portrait', label: 'A3 / A4 Portrait', badge: 'Standard Frame' },
    { value: 'square', label: 'Square 1:1', badge: 'Vinyl & Feed' },
    { value: 'story', label: 'Story 9:16', badge: 'Social Media' },
    { value: 'a4-landscape', label: 'Landscape', badge: 'Wide Wall' }
  ];

  // Export State
  public isExporting = false;
  public exportFormat: 'png' | 'pdf' = 'png';
  public hasMap = false;
  public errorMessage = '';

  // Leaflet map internals
  private leafletMap: any = null;
  private L: any = null;
  private markersLayer: any = null;
  private tileLayerInstance: any = null;
  private pinsSubscription: Subscription | undefined;
  private resizeListener: any = null;

  constructor() {}

  ngOnInit(): void {
    this.pinsSubscription = this.mapPinsService.pins$.subscribe(pins => {
      if (pins.length > 0) {
        this.availableAreas = this.mapPinsService.getAvailableAreas();
        // Default to first area (Athens) immediately if none selected
        if (!this.selectedArea && this.availableAreas.length > 0) {
          this.selectArea(this.availableAreas[0].area);
        } else if (this.selectedArea && this.L) {
          this.renderAreaPins();
        }
        this.cdr.detectChanges();
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.mapPinsService.initialize();
    const Leaflet = await import('leaflet');
    this.L = (Leaflet as any).default || Leaflet;
    (window as any).L = this.L;
    this.initPosterMap();

    // Listen to window resize / orientation change for smooth smartphone rendering
    this.resizeListener = () => {
      if (this.leafletMap) {
        this.leafletMap.invalidateSize();
      }
    };
    window.addEventListener('resize', this.resizeListener);
    window.addEventListener('orientationchange', this.resizeListener);

    // If area was already selected before leaflet finished importing, render now
    if (this.selectedArea) {
      setTimeout(() => {
        this.resetMapBounds();
        this.renderAreaPins();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.pinsSubscription?.unsubscribe();
    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
      window.removeEventListener('orientationchange', this.resizeListener);
    }
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
  }

  // ─── Map Initialisation ──────────────────────────────────────────────────────

  private initPosterMap(): void {
    const L = this.L;
    const container = document.getElementById('poster-map');
    if (!container || !L) return;
    if ((container as any)._leaflet_id) return;

    // Disabled touchZoom, scrollWheelZoom & dragging initially so mobile users can scroll the webpage freely!
    this.leafletMap = L.map('poster-map', {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false
    }).setView([38.0, 23.7], 6);

    this.updateTileLayer();
    this.markersLayer = L.layerGroup().addTo(this.leafletMap);
  }

  private updateTileLayer(): void {
    if (!this.leafletMap || !this.L) return;
    const envKey = typeof window !== 'undefined' ? (window as any).__ENV__?.CARTO_API_KEY : null;
    const apiKey = envKey || environment.cartoApiKey || '';
    const apiKeyQuery = apiKey ? '?key=' + apiKey : '';

    const subName = this.currentTheme.tileLayer === 'light' ? 'light_all' : 'dark_all';
    const tileUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/${subName}/{z}/{x}/{y}.png${apiKeyQuery}`;

    if (this.tileLayerInstance) {
      this.tileLayerInstance.setUrl(tileUrl);
    } else {
      this.tileLayerInstance = this.L.tileLayer(tileUrl, {
        subdomains: 'abcd',
        maxZoom: 20,
        crossOrigin: true
      }).addTo(this.leafletMap);
    }
  }

  // ─── Theme & Density Selection ───────────────────────────────────────────────

  public setTheme(themeId: ThemeId): void {
    const found = this.themes.find(t => t.id === themeId);
    if (!found) return;
    this.currentTheme = found;
    this.updateTileLayer();

    if (this.selectedArea) {
      const areaPins = this.mapPinsService.getPinsForArea(this.selectedArea);
      this.buildArtistColors(areaPins);
      this.renderAreaPins();
    }
  }

  public setLabelDensity(density: LabelDensity): void {
    this.labelDensity = density;
    this.renderAreaPins();
  }

  public setAspectRatio(ratio: AspectRatio): void {
    this.aspectRatio = ratio;
    setTimeout(() => {
      if (this.leafletMap) {
        this.leafletMap.invalidateSize();
        this.resetMapBounds();
      }
    }, 250);
  }

  public toggleMapLock(): void {
    this.isMapLocked = !this.isMapLocked;
    if (!this.leafletMap) return;
    if (this.isMapLocked) {
      this.leafletMap.scrollWheelZoom?.disable();
      this.leafletMap.dragging?.disable();
      this.leafletMap.touchZoom?.disable();
      this.leafletMap.doubleClickZoom?.disable();
    } else {
      this.leafletMap.scrollWheelZoom?.enable();
      this.leafletMap.dragging?.enable();
      this.leafletMap.touchZoom?.enable();
      this.leafletMap.doubleClickZoom?.enable();
    }
  }

  public zoomIn(): void {
    this.leafletMap?.zoomIn();
  }

  public zoomOut(): void {
    this.leafletMap?.zoomOut();
  }

  public resetMapBounds(): void {
    if (!this.selectedArea || !this.leafletMap || !this.L) return;
    const area = this.selectedArea;
    const bounds = this.L.latLngBounds(
      [area.bounds.minLat, area.bounds.minLng],
      [area.bounds.maxLat, area.bounds.maxLng]
    );
    this.leafletMap.fitBounds(bounds, { padding: [35, 35], animate: true });
  }

  public scrollToSettings(): void {
    const el = document.getElementById('studio-controls-panel');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─── Area & Artist Logic ─────────────────────────────────────────────────────

  public selectArea(area: AreaDefinition): void {
    this.selectedArea = area;
    this.errorMessage = '';

    const areaPins = this.mapPinsService.getPinsForArea(area);
    if (areaPins.length === 0) {
      this.errorMessage = 'No lyric mentions found for this area.';
      return;
    }

    this.buildArtistColors(areaPins);
    this.hasMap = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.leafletMap) {
        this.leafletMap.invalidateSize();
        this.resetMapBounds();
      }
      this.renderAreaPins();
    }, 80);
  }

  private buildArtistColors(pins: LocationData[]): void {
    const artists = Array.from(new Set(pins.map(p => p.artist))).sort();
    const existingMap = new Map(this.artistColors.map(a => [a.artist, a]));
    const palette = this.currentTheme.palette;

    this.artistColors = artists.map((artist, i) => ({
      artist,
      color: palette[i % palette.length],
      selected: existingMap.get(artist)?.selected ?? true
    }));
  }

  public toggleArtist(artist: string): void {
    const ac = this.artistColors.find(a => a.artist === artist);
    if (ac) {
      ac.selected = !ac.selected;
      this.renderAreaPins();
    }
  }

  public selectAllArtists(): void {
    this.artistColors.forEach(a => (a.selected = true));
    this.renderAreaPins();
  }

  public clearAllArtists(): void {
    this.artistColors.forEach(a => (a.selected = false));
    this.renderAreaPins();
  }

  public getSelectedArtistCount(): number {
    return this.artistColors.filter(a => a.selected).length;
  }

  public get topLegendArtists(): ArtistColor[] {
    return this.artistColors.filter(a => a.selected).slice(0, 7);
  }

  public get remainingArtistsCount(): number {
    const total = this.artistColors.filter(a => a.selected).length;
    return Math.max(0, total - 7);
  }

  // ─── Pin Rendering ───────────────────────────────────────────────────────────

  private renderAreaPins(): void {
    if (!this.selectedArea || !this.leafletMap || !this.L || !this.markersLayer) return;

    const L = this.L;
    const area = this.selectedArea;
    const selectedArtists = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const colorMap = new Map(this.artistColors.map(a => [a.artist, a.color]));

    this.markersLayer.clearLayers();

    const areaPins = this.mapPinsService
      .getPinsForArea(area)
      .filter(p => selectedArtists.has(p.artist));

    if (areaPins.length === 0) return;

    // Group pins by normalized location
    const groups = new Map<string, PinGroup>();
    areaPins.forEach(pin => {
      const key = this.mapPinsService.normalizeLocationName(pin.location);
      if (!groups.has(key)) {
        groups.set(key, {
          lat: pin.lat,
          lng: pin.lng,
          location: pin.location,
          mentions: [],
          jitteredLat: pin.lat,
          jitteredLng: pin.lng
        });
      }
      groups.get(key)!.mentions.push(pin);
    });

    // Golden-angle jitter for overlapping coordinate sets
    const placedCoords = new Map<string, number>();
    groups.forEach(group => {
      const coordKey = group.lat.toFixed(4) + '_' + group.lng.toFixed(4);
      const count = placedCoords.get(coordKey) || 0;
      placedCoords.set(coordKey, count + 1);
      if (count > 0) {
        const angle = count * 137.5 * (Math.PI / 180);
        const radius = 0.001 * Math.ceil(count / 6);
        group.jitteredLat = group.lat + Math.cos(angle) * radius;
        group.jitteredLng = group.lng + Math.sin(angle) * radius;
      }
    });

    // Rank groups by mention count for selective labeling in 'top' mode
    const sortedGroups = Array.from(groups.values()).sort(
      (a, b) => b.mentions.length - a.mentions.length
    );
    const topLocationKeys = new Set(
      sortedGroups.slice(0, 8).map(g => this.mapPinsService.normalizeLocationName(g.location))
    );

    // Create markers
    groups.forEach(group => {
      const artistCount: Record<string, number> = {};
      group.mentions.forEach(m => {
        artistCount[m.artist] = (artistCount[m.artist] || 0) + 1;
      });
      const dominantArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0][0];
      const color = colorMap.get(dominantArtist) || this.currentTheme.accentColor;

      const displayName = this.mapPinsService.capitalizeFirst(group.location);
      const totalMentions = group.mentions.length;
      const radius = Math.min(4.5 + totalMentions * 1.4, 13);

      const strokeColor = this.currentTheme.id === 'gallery' ? '#18181b' : '#0c0d12';

      const marker = L.circleMarker([group.jitteredLat, group.jitteredLng], {
        color: strokeColor,
        fillColor: color,
        fillOpacity: 0.92,
        radius,
        weight: 1.5
      });

      // Label density logic
      const normKey = this.mapPinsService.normalizeLocationName(group.location);
      let showPermanent = false;
      if (this.labelDensity === 'all') {
        showPermanent = true;
      } else if (this.labelDensity === 'top') {
        showPermanent = topLocationKeys.has(normKey) || totalMentions >= 3;
      } else {
        showPermanent = false;
      }

      if (showPermanent) {
        marker.bindTooltip(
          `<span class="poster-pin-label-text">${displayName}</span>`,
          {
            permanent: true,
            direction: 'top',
            offset: [0, -radius - 2],
            className: `poster-pin-label theme-${this.currentTheme.id}`,
            opacity: 1
          }
        );
      } else {
        // Non-permanent tooltip on hover
        marker.bindTooltip(
          `<span class="poster-pin-hover-text">${displayName} (${totalMentions})</span>`,
          {
            permanent: false,
            direction: 'top',
            offset: [0, -radius - 2],
            className: `poster-pin-label theme-${this.currentTheme.id}`
          }
        );
      }

      // Interactive popup on click
      const popupRows = group.mentions
        .slice(0, 4)
        .map(
          m =>
            `<div class="poster-popup-item">` +
            `<span class="poster-popup-artist" style="color:${colorMap.get(m.artist) || color}">${m.artist}</span>` +
            `<span class="poster-popup-song">"${m.song}"</span>` +
            `</div>`
        )
        .join('');
      const moreRow =
        group.mentions.length > 4
          ? `<div class="poster-popup-more">+${group.mentions.length - 4} more</div>`
          : '';

      marker.bindPopup(
        `<div class="poster-popup theme-${this.currentTheme.id}">` +
          `<div class="poster-popup-location">${displayName}</div>` +
          `<div class="poster-popup-count">${totalMentions} mention${totalMentions !== 1 ? 's' : ''}</div>` +
          popupRows +
          moreRow +
          `</div>`,
        { className: 'poster-popup-container' }
      );

      this.markersLayer.addLayer(marker);
    });
  }

  // ─── Poster Typographic Computations ─────────────────────────────────────────

  public get spacedAreaTitle(): string {
    if (!this.selectedArea) return '';
    return this.selectedArea.displayName.toUpperCase().split('').join(' ');
  }

  public get formattedCoordinates(): string {
    if (!this.selectedArea) return '';
    const lat = this.selectedArea.centerLat;
    const lng = this.selectedArea.centerLng;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const latDeg = Math.floor(Math.abs(lat));
    const latMin = Math.floor((Math.abs(lat) - latDeg) * 60);
    const latSec = Math.round(((Math.abs(lat) - latDeg) * 60 - latMin) * 60);
    const lngDeg = Math.floor(Math.abs(lng));
    const lngMin = Math.floor((Math.abs(lng) - lngDeg) * 60);
    const lngSec = Math.round(((Math.abs(lng) - lngDeg) * 60 - lngMin) * 60);
    return `${latDeg}° ${latMin}′ ${latSec}″ ${latDir} · ${lngDeg}° ${lngMin}′ ${lngSec}″ ${lngDir}`;
  }

  public get filteredMentionsCount(): number {
    if (!this.selectedArea) return 0;
    const sel = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    return this.mapPinsService
      .getPinsForArea(this.selectedArea)
      .filter(p => sel.has(p.artist)).length;
  }

  public get filteredSongsCount(): number {
    if (!this.selectedArea) return 0;
    const sel = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const pins = this.mapPinsService
      .getPinsForArea(this.selectedArea)
      .filter(p => sel.has(p.artist));
    return new Set(pins.map(p => p.artist + '||' + p.song)).size;
  }

  public get filteredLocationsCount(): number {
    if (!this.selectedArea) return 0;
    const sel = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const pins = this.mapPinsService
      .getPinsForArea(this.selectedArea)
      .filter(p => sel.has(p.artist));
    return new Set(pins.map(p => this.mapPinsService.normalizeLocationName(p.location))).size;
  }

  // ─── Poster Export (High DPI Canvas & PDF) ───────────────────────────────────

  public async exportPoster(format: 'png' | 'pdf'): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.selectedArea) return;

    this.isExporting = true;
    this.exportFormat = format;
    this.isArtistFilterOpen = false;
    this.cdr.detectChanges();

    // Give layout and dropdowns time to settle
    await new Promise(r => setTimeout(r, 200));

    const posterEl = document.getElementById('poster-frame');
    if (!posterEl) {
      this.isExporting = false;
      return;
    }

    try {
      posterEl.classList.add('is-exporting-mode');

      const html2canvas = (await import('html2canvas')).default;
      // Wait for tiles and fonts to stabilize
      await new Promise(r => setTimeout(r, 700));

      const canvas = await html2canvas(posterEl, {
        useCORS: true,
        allowTaint: false,
        scale: 3, // Ultra-sharp 300 DPI print scale
        backgroundColor: this.currentTheme.bgColor,
        logging: false,
        ignoreElements: (element: Element) => {
          return (
            element.classList.contains('leaflet-control-zoom') ||
            element.classList.contains('leaflet-control-attribution') ||
            element.classList.contains('map-camera-floating-btn') ||
            element.classList.contains('mobile-bottom-bar')
          );
        }
      });

      posterEl.classList.remove('is-exporting-mode');

      const cleanFilename = `lyricmap-${this.selectedArea?.id || 'area'}-${this.currentTheme.id}-${this.aspectRatio}`;

      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `${cleanFilename}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const imgData = canvas.toDataURL('image/png');

        let orientation: 'portrait' | 'landscape' = 'portrait';
        let paperFormat: any = 'a4';

        switch (this.aspectRatio) {
          case 'a3-portrait':
            orientation = 'portrait';
            paperFormat = 'a3';
            break;
          case 'a4-landscape':
            orientation = 'landscape';
            paperFormat = 'a4';
            break;
          case 'square':
            orientation = 'portrait';
            paperFormat = [210, 210];
            break;
          case 'story':
            orientation = 'portrait';
            paperFormat = [120, 213.3];
            break;
          default:
            orientation = 'portrait';
            paperFormat = 'a4';
        }

        const pdf = new jsPDF({ orientation, unit: 'mm', format: paperFormat });
        const dims = pdf.internal.pageSize;
        const pw = dims.getWidth();
        const ph = dims.getHeight();
        const canvasAspect = canvas.width / canvas.height;
        const pageAspect = pw / ph;
        let iw = pw;
        let ih = ph;

        if (canvasAspect > pageAspect) {
          ih = pw / canvasAspect;
        } else {
          iw = ph * canvasAspect;
        }

        pdf.addImage(imgData, 'PNG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
        pdf.save(`${cleanFilename}.pdf`);
      }
    } catch (err) {
      console.error('[Poster] Export failed:', err);
      this.errorMessage = 'Export failed. Please try again.';
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }
}
