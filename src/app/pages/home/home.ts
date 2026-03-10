import { Component, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import mapData from '../../data/rappers_locations_mapped.json';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements AfterViewInit {
  private map: any;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      // Dynamic import to prevent SSR issues with Leaflet
      const L = await import('leaflet');
      
      this.initMap(L);
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

    // Loop through the imported dataset to plot the actual coordinate points
    mapData.forEach((point: any) => {
      L.circleMarker([point.lat, point.lng], {
        color: '#a855f7',
        radius: 6,
        fillOpacity: 0.6,
        weight: 1
      }).addTo(this.map)
        .bindPopup(`
          <div class="custom-popup">
            <div class="popup-location">${point.location}</div>
            <div class="popup-artist">${point.artist}</div>
            <div class="popup-song">"${point.song}"</div>
          </div>
        `, {
          className: 'premium-popup'
        });
    });
  }
}
