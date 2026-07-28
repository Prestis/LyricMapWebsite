import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapPinsService, LocationData } from '../../../services/map-pins.service';
import { ReportsService, Report } from '../../../services/reports.service';

@Component({
  selector: 'app-location-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-management.component.html',
  styleUrls: ['./location-management.component.scss']
})
export class LocationManagementComponent implements OnInit {
  allPins: LocationData[] = [];
  filteredPins: LocationData[] = [];
  searchTerm: string = '';
  savingId: number | null = null;
  
  reports: Report[] = [];
  resolvingId: number | null = null;

  constructor(
    private mapPinsService: MapPinsService,
    private reportsService: ReportsService
  ) {}

  ngOnInit(): void {
    this.mapPinsService.pins$.subscribe(pins => {
      this.allPins = pins;
      this.onSearch();
    });
    this.fetchReports();
  }

  fetchReports(): void {
    this.reportsService.getReports().subscribe({
      next: (data) => {
        this.reports = data;
      },
      error: (err) => {
        console.error('Failed to fetch reports:', err);
      }
    });
  }

  onSearch(): void {
    if (!this.searchTerm) {
      this.filteredPins = [...this.allPins];
    } else {
      const term = this.mapPinsService.normalizeLocationName(this.searchTerm);
      this.filteredPins = this.allPins.filter(p => 
        this.mapPinsService.normalizeLocationName(p.artist).includes(term) ||
        this.mapPinsService.normalizeLocationName(p.song).includes(term) ||
        this.mapPinsService.normalizeLocationName(p.location).includes(term)
      );
    }
  }

  saveLocation(pin: LocationData): void {
    this.savingId = pin.id;
    this.mapPinsService.updateLocation(pin.id, pin.lat, pin.lng).subscribe({
      next: () => {
        this.savingId = null;
        alert('Location updated successfully!');
      },
      error: (err) => {
        console.error('Failed to update location:', err);
        this.savingId = null;
        alert('Failed to update location. See console for details.');
      }
    });
  }

  getSpotifyUrl(artist: string, song: string): string {
    return `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + song)}`;
  }

  resolveReport(reportId: number): void {
    this.resolvingId = reportId;
    this.reportsService.resolveReport(reportId).subscribe({
      next: () => {
        this.resolvingId = null;
        this.reports = this.reports.filter(r => r.id !== reportId);
      },
      error: (err) => {
        console.error('Failed to resolve report:', err);
        this.resolvingId = null;
        alert('Failed to resolve report.');
      }
    });
  }
}
