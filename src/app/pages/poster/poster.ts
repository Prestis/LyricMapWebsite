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

export type AspectRatio = 'a3-portrait' | 'a4-portrait' | 'a4-landscape' | 'square';

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

const ARTIST_PALETTE = [
  '#ccff00', '#ff6b6b', '#00d4ff', '#ff9f43', '#a29bfe',
  '#fd79a8', '#55efc4', '#fdcb6e', '#e17055', '#74b9ff',
  '#81ecec', '#fab1a0', '#dfe6e9', '#b2bec3', '#6c5ce7',
  '#00b894', '#e84393', '#0984e3', '#d63031', '#00cec9'
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

  // Area selection
  public availableAreas: { area: AreaDefinition; count: number }[] = [];
  public selectedArea: AreaDefinition | null = null;

  // Artist filter
  public artistColors: ArtistColor[] = [];
  public isArtistFilterOpen = false;

  // Poster settings
  public aspectRatio: AspectRatio = 'a3-portrait';
  public readonly aspectRatioOptions: { value: AspectRatio; label: string }[] = [
    { value: 'a3-portrait', label: 'A3 Portrait (framing)' },
    { value: 'a4-portrait', label: 'A4 Portrait' },
    { value: 'a4-landscape', label: 'A4 Landscape' },
    { value: 'square', label: 'Square (1:1)' }
  ];

  // State
  public isExporting = false;
  public exportFormat: 'png' | 'pdf' = 'png';
  public hasMap = false;
  public errorMessage = '';

  // Map internals
  private leafletMap: any = null;
  private L: any = null;
  private markersLayer: any = null;
  private pinsSubscription: Subscription | undefined;

  constructor() { }

  ngOnInit(): void {
    this.pinsSubscription = this.mapPinsService.pins$.subscribe(pins => {
      if (pins.length > 0) {
        this.availableAreas = this.mapPinsService.getAvailableAreas();
        if (this.selectedArea && this.L) {
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
  }

  ngOnDestroy(): void {
    this.pinsSubscription?.unsubscribe();
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

    this.leafletMap = L.map('poster-map', {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true
    }).setView([38.0, 23.7], 6);

    const envKey = typeof window !== 'undefined' ? (window as any).__ENV__?.CARTO_API_KEY : null;
    const apiKey = envKey || environment.cartoApiKey || '';
    const apiKeyQuery = apiKey ? '?key=' + apiKey : '';
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png' + apiKeyQuery,
      { subdomains: 'abcd', maxZoom: 20, crossOrigin: true }
    ).addTo(this.leafletMap);

    this.markersLayer = L.layerGroup().addTo(this.leafletMap);
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

    // 1. Force Angular to update the DOM immediately so [class.visible] is applied
    this.cdr.detectChanges();

    // 2. Wait a tick for the browser to physically render the CSS dimensions
    setTimeout(() => {
      if (this.leafletMap) {
        // 3. Tell Leaflet its container has changed from display:none to visible
        this.leafletMap.invalidateSize();
      }

      // 4. Now calculate bounds and draw pins on a visible map
      this.renderAreaPins();
    }, 50);
  }

  private buildArtistColors(pins: LocationData[]): void {
    const artists = Array.from(new Set(pins.map(p => p.artist))).sort();
    const existingMap = new Map(this.artistColors.map(a => [a.artist, a]));
    this.artistColors = artists.map((artist, i) => ({
      artist,
      color: ARTIST_PALETTE[i % ARTIST_PALETTE.length],
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

  public toggleArtistFilter(): void {
    this.isArtistFilterOpen = !this.isArtistFilterOpen;
  }

  // ─── Pin Rendering ───────────────────────────────────────────────────────────

  private renderAreaPins(): void {
    if (!this.selectedArea || !this.leafletMap || !this.L || !this.markersLayer) return;

    const L = this.L;
    const area = this.selectedArea;
    const selectedArtists = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const colorMap = new Map(this.artistColors.map(a => [a.artist, a.color]));

    this.markersLayer.clearLayers();

    const areaPins = this.mapPinsService.getPinsForArea(area)
      .filter(p => selectedArtists.has(p.artist));

    if (areaPins.length === 0) return;

    // Group by normalised location name
    const groups = new Map<string, PinGroup>();
    areaPins.forEach(pin => {
      const key = this.mapPinsService.normalizeLocationName(pin.location);
      if (!groups.has(key)) {
        groups.set(key, {
          lat: pin.lat, lng: pin.lng,
          location: pin.location, mentions: [],
          jitteredLat: pin.lat, jitteredLng: pin.lng
        });
      }
      groups.get(key)!.mentions.push(pin);
    });

    // Golden-angle jitter for co-located pins
    const placedCoords = new Map<string, number>();
    groups.forEach(group => {
      const coordKey = group.lat.toFixed(4) + '_' + group.lng.toFixed(4);
      const count = placedCoords.get(coordKey) || 0;
      placedCoords.set(coordKey, count + 1);
      if (count > 0) {
        const angle = (count * 137.5) * (Math.PI / 180);
        const radius = 0.001 * Math.ceil(count / 6);
        group.jitteredLat = group.lat + Math.cos(angle) * radius;
        group.jitteredLng = group.lng + Math.sin(angle) * radius;
      }
    });

    // Create markers
    groups.forEach(group => {
      // Dominant artist colour
      const artistCount: Record<string, number> = {};
      group.mentions.forEach(m => { artistCount[m.artist] = (artistCount[m.artist] || 0) + 1; });
      const dominantArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0][0];
      const color = colorMap.get(dominantArtist) || '#ccff00';

      const displayName = this.mapPinsService.capitalizeFirst(group.location);
      const totalMentions = group.mentions.length;

      const marker = L.circleMarker([group.jitteredLat, group.jitteredLng], {
        color,
        fillColor: color,
        fillOpacity: 0.85,
        radius: Math.min(4 + totalMentions * 1.5, 12),
        weight: 1.5
      });

      // Permanent label tooltip
      marker.bindTooltip(
        '<span style="color:' + color + ';font-weight:700">' + displayName + '</span>',
        { permanent: true, direction: 'top', offset: [0, -8], className: 'poster-pin-label', opacity: 1 }
      );

      // Click popup with details
      const popupRows = group.mentions.slice(0, 5).map(m =>
        '<div class="poster-popup-item">' +
        '<span class="poster-popup-artist" style="color:' + (colorMap.get(m.artist) || '#ccff00') + '">' + m.artist + '</span>' +
        '<span class="poster-popup-song">"' + m.song + '"</span>' +
        '</div>'
      ).join('');
      const moreRow = group.mentions.length > 5
        ? '<div class="poster-popup-more">+' + (group.mentions.length - 5) + ' more</div>'
        : '';

      marker.bindPopup(
        '<div class="poster-popup">' +
        '<div class="poster-popup-location">' + displayName + '</div>' +
        '<div class="poster-popup-count">' + totalMentions + ' mention' + (totalMentions !== 1 ? 's' : '') + '</div>' +
        popupRows + moreRow +
        '</div>',
        { className: 'poster-popup-container' }
      );

      this.markersLayer.addLayer(marker);
    });

    // Fit map to area bounds
    const bounds = L.latLngBounds(
      [area.bounds.minLat, area.bounds.minLng],
      [area.bounds.maxLat, area.bounds.maxLng]
    );
    this.leafletMap.fitBounds(bounds, { padding: [30, 30], animate: true });
  }

  // ─── Computed Stats ──────────────────────────────────────────────────────────

  public get filteredMentionsCount(): number {
    if (!this.selectedArea) return 0;
    const sel = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    return this.mapPinsService.getPinsForArea(this.selectedArea).filter(p => sel.has(p.artist)).length;
  }

  public get filteredSongsCount(): number {
    if (!this.selectedArea) return 0;
    const sel = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const pins = this.mapPinsService.getPinsForArea(this.selectedArea).filter(p => sel.has(p.artist));
    return new Set(pins.map(p => p.artist + '||' + p.song)).size;
  }

  public get filteredLocationsCount(): number {
    if (!this.selectedArea) return 0;
    const sel = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const pins = this.mapPinsService.getPinsForArea(this.selectedArea).filter(p => sel.has(p.artist));
    return new Set(pins.map(p => this.mapPinsService.normalizeLocationName(p.location))).size;
  }

  // ─── Poster Format & Export ──────────────────────────────────────────────────

  public onAspectRatioChange(): void {
    setTimeout(() => { this.leafletMap?.invalidateSize(); }, 350);
  }

  public async exportPoster(format: 'png' | 'pdf'): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.selectedArea) return;

    this.isExporting = true;
    this.exportFormat = format;
    this.isArtistFilterOpen = false;
    this.cdr.detectChanges();

    // Give any open dropdowns time to close before capture
    await new Promise(r => setTimeout(r, 300));

    const posterEl = document.getElementById('poster-frame');
    if (!posterEl) { this.isExporting = false; return; }

    try {
      const html2canvas = (await import('html2canvas')).default;
      // Allow map tiles to fully paint
      await new Promise(r => setTimeout(r, 900));

      const canvas = await html2canvas(posterEl, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        backgroundColor: '#0d0d0d',
        logging: false
      });

      if (format === 'png') {
        const link = document.createElement('a');
        link.download = 'lyricmap-' + (this.selectedArea?.id || 'area') + '-poster.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const imgData = canvas.toDataURL('image/png');

        let orientation: 'portrait' | 'landscape' = 'portrait';
        let paperFormat: any = 'a4';
        switch (this.aspectRatio) {
          case 'a3-portrait': orientation = 'portrait'; paperFormat = 'a3'; break;
          case 'a4-landscape': orientation = 'landscape'; paperFormat = 'a4'; break;
          case 'square': orientation = 'portrait'; paperFormat = [210, 210]; break;
          default: orientation = 'portrait'; paperFormat = 'a4';
        }

        const pdf = new jsPDF({ orientation, unit: 'mm', format: paperFormat });
        const dims = pdf.internal.pageSize;
        const pw = dims.getWidth();
        const ph = dims.getHeight();
        const canvasAspect = canvas.width / canvas.height;
        const pageAspect = pw / ph;
        let iw = pw, ih = ph;
        if (canvasAspect > pageAspect) ih = pw / canvasAspect;
        else iw = ph * canvasAspect;

        pdf.addImage(imgData, 'PNG', (pw - iw) / 2, (ph - ih) / 2, iw, ih);
        pdf.save('lyricmap-' + (this.selectedArea?.id || 'area') + '-poster.pdf');
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
