import { Component, AfterViewInit, PLATFORM_ID, Inject, OnDestroy, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { MapPinsService, LocationData } from '../../services/map-pins.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements AfterViewInit, OnDestroy {
  private map: any;
  private markerClusterGroup: any;
  private pinsSubscription: Subscription | undefined;
  private mapPinsService = inject(MapPinsService);
  private platformId = inject(PLATFORM_ID);

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

      // Subscribe to map pins from service
      this.pinsSubscription = this.mapPinsService.pins$.subscribe(pins => {
        console.log('[Home] Received pins. Count:', pins.length);
        this.updateMapPins(leafletWithPlugins, pins);
      });
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

    pins.forEach((point: LocationData) => {
      const marker = L.circleMarker([point.lat, point.lng], {
        color: '#a855f7',
        radius: 6,
        fillOpacity: 0.6,
        weight: 1
      }).bindPopup(`
          <div class="custom-popup">
            <div class="popup-location">${point.location}</div>
            <div class="popup-artist">${point.artist}</div>
            <div class="popup-song">"${point.song}"</div>
          </div>
        `, {
        className: 'premium-popup'
      });

      markers.push(marker);
    });

    this.markerClusterGroup.addLayers(markers);
  }
}
