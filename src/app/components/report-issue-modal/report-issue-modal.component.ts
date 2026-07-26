import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportsService } from '../../services/reports.service';

@Component({
  selector: 'app-report-issue-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-issue-modal.component.html',
  styleUrls: ['./report-issue-modal.component.scss']
})
export class ReportIssueModalComponent {
  @Input() locationId!: number;
  @Input() locationName!: string;
  @Output() close = new EventEmitter<void>();

  reportType: 'fictional' | 'suggestion' | '' = '';
  suggestion: string = '';
  honeypot: string = '';

  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  constructor(private reportsService: ReportsService) {}

  submitReport(): void {
    if (this.honeypot) {
      // Bot detected, silently succeed
      this.successMessage = 'Thank you for your report!';
      setTimeout(() => this.closeModal(), 2000);
      return;
    }

    if (!this.reportType) {
      this.errorMessage = 'Please select a report type.';
      return;
    }

    if (this.reportType === 'suggestion' && !this.suggestion.trim()) {
      this.errorMessage = 'Please provide a suggested location.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.reportsService.submitReport(this.locationId, this.reportType, this.suggestion).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = 'Thank you for your report! An admin will review it.';
        setTimeout(() => this.closeModal(), 2000);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.message || 'An error occurred. Please try again.';
      }
    });
  }

  closeModal(): void {
    this.close.emit();
  }
}
