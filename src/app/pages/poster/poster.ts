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
  mentions: number;
  selected: boolean;
  /** Palette index while selected, -1 otherwise. Keeps colours stable across theme changes. */
  slot: number;
  color: string;
}

interface PinGroup {
  lat: number;
  lng: number;
  location: string;
  mentions: LocationData[];
  jitteredLat: number;
  jitteredLng: number;
}

interface PlacedPin {
  lat: number;
  lng: number;
  radius: number;
  label: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_POSTER_ARTISTS = 6;
const TOP_LABEL_LIMIT = 12;
const LABEL_FONT_PX = 10;
const LABEL_TRACKING_EM = 0.08;
const LABEL_HEIGHT_PX = 12;
const LABEL_GAP_PX = 3;
const LABEL_PADDING_PX = 2;
const UNSELECTED_ARTIST_COLOR = '#4b5563';
// iOS Safari refuses canvases above ~16.7 megapixels
const MAX_EXPORT_CANVAS_PIXELS = 16_000_000;
const EXPORT_TARGET_WIDTH_PX: Record<AspectRatio, number> = {
  'a3-portrait': 3508, // A4 @ 300 DPI width; A3 lands at ~290 DPI after the canvas cap
  'a4-landscape': 3508,
  square: 3000,
  story: 2160
};

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
    palette: ['#ccff00', '#00e5ff', '#ff4fd8', '#ffb020', '#9d7bff', '#ff5c5c']
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
    palette: ['#18181b', '#c2410c', '#1d4ed8', '#047857', '#9d174d', '#a16207']
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
    palette: ['#00e5ff', '#ffffff', '#ffd166', '#ff6b9a', '#7cf29c', '#b49cff']
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
    palette: ['#f59e0b', '#fef3c7', '#e4572e', '#8ecae6', '#a7c957', '#d291bc']
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
  public readonly maxArtists = MAX_POSTER_ARTISTS;
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
  private labelsLayer: any = null;
  private placedPins: PlacedPin[] = [];
  private labelMeasureCtx: CanvasRenderingContext2D | null = null;
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
    this.labelsLayer = L.layerGroup().addTo(this.leafletMap);

    // Label collisions depend on screen-space positions, so re-place after every pan/zoom/resize
    this.leafletMap.on('moveend resize', () => this.placeLabels());
  }

  private updateTileLayer(): void {
    if (!this.leafletMap || !this.L) return;
    const envKey = typeof window !== 'undefined' ? (window as any).__ENV__?.CARTO_API_KEY : null;
    const apiKey = envKey || environment.cartoApiKey || '';
    const apiKeyQuery = apiKey ? '?key=' + apiKey : '';

    // Label-free basemap so street names don't compete with the lyric labels;
    // @2x tiles keep the map sharp when the export upscales the canvas.
    const subName = this.currentTheme.tileLayer === 'light' ? 'light_nolabels' : 'dark_nolabels';
    const tileUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/${subName}/{z}/{x}/{y}@2x.png${apiKeyQuery}`;

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
    this.refreshArtistColors();
    this.renderAreaPins();
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
    const counts = new Map<string, number>();
    pins.forEach(p => counts.set(p.artist, (counts.get(p.artist) || 0) + 1));
    const previous = new Map(this.artistColors.map(a => [a.artist, a]));

    // Most-mentioned artists first, so the list doubles as a "who matters here" ranking
    this.artistColors = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([artist, mentions]) => {
        const prev = previous.get(artist);
        return {
          artist,
          mentions,
          selected: prev?.selected ?? false,
          slot: prev?.selected ? prev.slot : -1,
          color: ''
        };
      });

    // Carry over the previous selection (capped), or default to the top artists of this area
    const carried = this.artistColors.filter(a => a.selected);
    if (carried.length === 0) {
      this.artistColors.slice(0, MAX_POSTER_ARTISTS).forEach(a => (a.selected = true));
    } else {
      carried.slice(MAX_POSTER_ARTISTS).forEach(a => (a.selected = false));
    }
    this.assignArtistSlots();
  }

  /** Gives every selected artist a unique palette slot, keeping existing slots where possible. */
  private assignArtistSlots(): void {
    const used = new Set<number>();
    this.artistColors.forEach(a => {
      if (!a.selected || a.slot < 0 || a.slot >= MAX_POSTER_ARTISTS || used.has(a.slot)) {
        a.slot = -1;
      } else {
        used.add(a.slot);
      }
    });
    this.artistColors.forEach(a => {
      if (a.selected && a.slot < 0) {
        let slot = 0;
        while (used.has(slot)) slot++;
        a.slot = slot;
        used.add(slot);
      }
    });
    this.refreshArtistColors();
  }

  private refreshArtistColors(): void {
    const palette = this.currentTheme.palette;
    this.artistColors.forEach(a => {
      a.color = a.selected ? palette[a.slot % palette.length] : UNSELECTED_ARTIST_COLOR;
    });
  }

  public toggleArtist(artist: string): void {
    const ac = this.artistColors.find(a => a.artist === artist);
    if (!ac) return;
    if (!ac.selected && this.isArtistLimitReached) return;
    ac.selected = !ac.selected;
    this.assignArtistSlots();
    this.renderAreaPins();
  }

  public selectTopArtists(): void {
    this.artistColors.forEach((a, i) => {
      a.selected = i < MAX_POSTER_ARTISTS;
      a.slot = -1;
    });
    this.assignArtistSlots();
    this.renderAreaPins();
  }

  public clearAllArtists(): void {
    this.artistColors.forEach(a => (a.selected = false));
    this.assignArtistSlots();
    this.renderAreaPins();
  }

  public getSelectedArtistCount(): number {
    return this.artistColors.filter(a => a.selected).length;
  }

  public get isArtistLimitReached(): boolean {
    return this.getSelectedArtistCount() >= MAX_POSTER_ARTISTS;
  }

  public get legendArtists(): ArtistColor[] {
    return this.artistColors.filter(a => a.selected).sort((a, b) => a.slot - b.slot);
  }

  // ─── Pin Rendering ───────────────────────────────────────────────────────────

  private renderAreaPins(): void {
    if (!this.selectedArea || !this.leafletMap || !this.L || !this.markersLayer) return;

    const L = this.L;
    const area = this.selectedArea;
    const selectedArtists = new Set(this.artistColors.filter(a => a.selected).map(a => a.artist));
    const colorMap = new Map(this.artistColors.map(a => [a.artist, a.color]));

    this.markersLayer.clearLayers();
    this.placedPins = [];

    const areaPins = this.mapPinsService
      .getPinsForArea(area)
      .filter(p => selectedArtists.has(p.artist));

    if (areaPins.length === 0) {
      this.placeLabels();
      return;
    }

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

    // Most-mentioned first: label placement is greedy, so the important spots win collisions
    const sortedGroups = Array.from(groups.values()).sort(
      (a, b) => b.mentions.length - a.mentions.length
    );

    sortedGroups.forEach(group => {
      const artistCount: Record<string, number> = {};
      group.mentions.forEach(m => {
        artistCount[m.artist] = (artistCount[m.artist] || 0) + 1;
      });
      const dominantArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0][0];
      const color = colorMap.get(dominantArtist) || this.currentTheme.accentColor;

      const displayName = this.mapPinsService.capitalizeFirst(group.location);
      const totalMentions = group.mentions.length;
      // Square-root scaling keeps a few hubs from swallowing their neighbours
      const radius = Math.min(3.5 + Math.sqrt(totalMentions) * 2.2, 12);

      const marker = L.circleMarker([group.jitteredLat, group.jitteredLng], {
        color: this.currentTheme.bgColor,
        fillColor: color,
        fillOpacity: 0.92,
        radius,
        weight: 1.5
      });

      // Hover tooltip for exploring; printed labels are placed separately in placeLabels()
      marker.bindTooltip(
        `<span class="poster-pin-hover-text">${displayName} (${totalMentions})</span>`,
        {
          permanent: false,
          direction: 'top',
          offset: [0, -radius - 2],
          className: 'poster-pin-label'
        }
      );

      this.placedPins.push({
        lat: group.jitteredLat,
        lng: group.jitteredLng,
        radius,
        label: this.toLabelText(group.location)
      });

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

    this.placeLabels();
  }

  // ─── Label Placement (collision-free) ────────────────────────────────────────

  /**
   * Greedy cartographic labelling: pins are visited by importance and each label tries
   * above / right / below / left of its pin. A label is only drawn where it overlaps no
   * other label and no pin; otherwise that spot stays an unlabelled dot.
   */
  private placeLabels(): void {
    if (!this.leafletMap || !this.L || !this.labelsLayer) return;
    const L = this.L;
    this.labelsLayer.clearLayers();
    if (this.labelDensity === 'minimal' || this.placedPins.length === 0) return;

    const size = this.leafletMap.getSize();
    const pins = this.placedPins
      .map(p => ({ ...p, pt: this.leafletMap.latLngToContainerPoint([p.lat, p.lng]) }))
      .filter(p => p.pt.x >= 0 && p.pt.y >= 0 && p.pt.x <= size.x && p.pt.y <= size.y);

    const occupied: Rect[] = pins.map(p => ({
      x: p.pt.x - p.radius,
      y: p.pt.y - p.radius,
      w: p.radius * 2,
      h: p.radius * 2
    }));
    const fitsInMap = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= size.x && r.y + r.h <= size.y;
    const overlaps = (a: Rect, b: Rect) =>
      a.x < b.x + b.w + LABEL_PADDING_PX &&
      b.x < a.x + a.w + LABEL_PADDING_PX &&
      a.y < b.y + b.h + LABEL_PADDING_PX &&
      b.y < a.y + a.h + LABEL_PADDING_PX;

    const candidates = this.labelDensity === 'top' ? pins.slice(0, TOP_LABEL_LIMIT) : pins;
    const { textColor, bgColor } = this.currentTheme;
    const halo = `0 0 2px ${bgColor}, 0 0 2px ${bgColor}, 0 0 3px ${bgColor}`;

    candidates.forEach(pin => {
      const w = this.measureLabel(pin.label);
      const h = LABEL_HEIGHT_PX;
      const { x, y } = pin.pt;
      const off = pin.radius + LABEL_GAP_PX;
      const positions: Rect[] = [
        { x: x - w / 2, y: y - off - h, w, h }, // above
        { x: x + off, y: y - h / 2, w, h }, // right
        { x: x - w / 2, y: y + off, w, h }, // below
        { x: x - off - w, y: y - h / 2, w, h } // left
      ];
      const spot = positions.find(r => fitsInMap(r) && !occupied.some(o => overlaps(r, o)));
      if (!spot) return;
      occupied.push(spot);

      const icon = L.divIcon({
        className: 'poster-map-label',
        html: `<span style="color:${textColor};text-shadow:${halo}">${pin.label}</span>`,
        iconSize: [w, h],
        iconAnchor: [x - spot.x, y - spot.y]
      });
      this.labelsLayer.addLayer(
        L.marker([pin.lat, pin.lng], { icon, interactive: false, keyboard: false })
      );
    });
  }

  private measureLabel(text: string): number {
    if (!this.labelMeasureCtx) {
      this.labelMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    const ctx = this.labelMeasureCtx;
    const tracking = text.length * LABEL_FONT_PX * LABEL_TRACKING_EM;
    if (!ctx) return text.length * LABEL_FONT_PX * 0.7 + tracking;
    ctx.font = `600 ${LABEL_FONT_PX}px Outfit, sans-serif`;
    return Math.ceil(ctx.measureText(text).width + tracking);
  }

  /** Map-style label: uppercase without accents (Greek capitals drop the tonos). */
  private toLabelText(location: string): string {
    return location
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase();
  }

  // ─── Poster Typographic Computations ─────────────────────────────────────────

  public get areaTitle(): string {
    return this.selectedArea ? this.selectedArea.displayName.toUpperCase() : '';
  }

  public get formattedCoordinates(): string {
    if (!this.selectedArea) return '';
    const fmt = (value: number, pos: string, neg: string) => {
      const totalMinutes = Math.round(Math.abs(value) * 60);
      const deg = Math.floor(totalMinutes / 60);
      const min = String(totalMinutes % 60).padStart(2, '0');
      return `${deg}°${min}′ ${value >= 0 ? pos : neg}`;
    };
    return `${fmt(this.selectedArea.centerLat, 'N', 'S')} · ${fmt(this.selectedArea.centerLng, 'E', 'W')}`;
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

      // Scale to the target print width, capped by what browsers can allocate for a canvas
      const { offsetWidth: w, offsetHeight: h } = posterEl;
      const scale = Math.min(
        EXPORT_TARGET_WIDTH_PX[this.aspectRatio] / w,
        Math.sqrt(MAX_EXPORT_CANVAS_PIXELS / (w * h))
      );

      const canvas = await html2canvas(posterEl, {
        useCORS: true,
        allowTaint: false,
        scale,
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
