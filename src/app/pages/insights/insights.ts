import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapPinsService, LocationData } from '../../services/map-pins.service';
import { Subscription } from 'rxjs';


@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './insights.html',
  styleUrl: './insights.scss'
})
export class Insights implements OnInit, OnDestroy {
  topRappers: { name: string; count: number }[] = [];
  topInternationalRappers: { name: string; count: number }[] = [];
  topCities: { name: string; count: number }[] = [];
  mostTravelledSongs: { title: string; artist: string; count: number }[] = [];
  totalLocations: number = 0;
  uniqueArtists: number = 0;
  private pinsSubscription: Subscription | undefined;
  private mapPinsService = inject(MapPinsService);

  constructor() {}

  // Greece Bounding Box (approximate)
  private readonly GREECE_BOUNDS = {
    minLat: 34.7,
    maxLat: 41.8,
    minLng: 19.0,
    maxLng: 28.5
  };

  ngOnInit(): void {
    this.pinsSubscription = this.mapPinsService.filteredPins$.subscribe(pins => {
      console.log('[Insights] Received filtered pins. Count:', pins.length);
      this.totalLocations = pins.length;
      this.calculateStats(pins);
    });
  }

  ngOnDestroy(): void {
    if (this.pinsSubscription) {
      this.pinsSubscription.unsubscribe();
    }
  }

  private calculateStats(data: LocationData[]): void {
    const artistCounts: Record<string, number> = {};
    const internationalArtistCounts: Record<string, number> = {};
    const cityCounts: Record<string, number> = {};
    const songTravel: Record<string, { artist: string; locations: Set<string> }> = {};

    data.forEach(item => {
      // Total per artist
      artistCounts[item.artist] = (artistCounts[item.artist] || 0) + 1;

      // International per artist
      if (!this.isInsideGreece(item.lat, item.lng)) {
        internationalArtistCounts[item.artist] = (internationalArtistCounts[item.artist] || 0) + 1;
      }

      // City frequency (normalized)
      const city = this.normalizeLocation(item.location);
      cityCounts[city] = (cityCounts[city] || 0) + 1;

      // Most travelled song
      const songKey = `${item.artist} - ${item.song}`;
      if (!songTravel[songKey]) {
        songTravel[songKey] = { artist: item.artist, locations: new Set() };
      }
      songTravel[songKey].locations.add(city);
    });

    this.uniqueArtists = Object.keys(artistCounts).length;

    // Process and sort stats
    this.topRappers = Object.entries(artistCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    this.topInternationalRappers = Object.entries(internationalArtistCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    this.topCities = Object.entries(cityCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    this.mostTravelledSongs = Object.entries(songTravel)
      .map(([key, info]) => ({
        title: key.split(' - ')[1],
        artist: info.artist,
        count: info.locations.size
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private normalizeLocation(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD') // Decompose combined characters (e.g., ά -> α + ́)
      .replace(/[\u0300-\u036f]/g, ''); // Remove the combining diacritical marks
  }

  private isInsideGreece(lat: number, lng: number): boolean {
    return (
      lat >= this.GREECE_BOUNDS.minLat &&
      lat <= this.GREECE_BOUNDS.maxLat &&
      lng >= this.GREECE_BOUNDS.minLng &&
      lng <= this.GREECE_BOUNDS.maxLng
    );
  }
}

