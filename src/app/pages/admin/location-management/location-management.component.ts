import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapPinsService, LocationData } from '../../../services/map-pins.service';

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

  constructor(private mapPinsService: MapPinsService) {}

  ngOnInit(): void {
    this.mapPinsService.pins$.subscribe(pins => {
      this.allPins = pins;
      this.onSearch();
    });
  }

  onSearch(): void {
    if (!this.searchTerm) {
      this.filteredPins = [...this.allPins];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredPins = this.allPins.filter(p => 
        p.artist.toLowerCase().includes(term) ||
        p.song.toLowerCase().includes(term) ||
        p.location.toLowerCase().includes(term)
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
}
