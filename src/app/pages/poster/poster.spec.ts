import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PosterComponent } from './poster';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';

// Mocking the service described in the plan
class MockMapPinsService {
    pins$ = of([]);
    getAreaGroups() {
        return of([
            { area: { id: 'athens', displayName: 'Athens' }, count: 120 },
            { area: { id: 'thess', displayName: 'Thessaloniki' }, count: 45 }
        ]);
    }
}

describe('PosterComponent', () => {
    let component: PosterComponent;
    let fixture: ComponentFixture<PosterComponent>;
    let mockMapPinsService: MockMapPinsService;

    beforeEach(async () => {
        mockMapPinsService = new MockMapPinsService();

        await TestBed.configureTestingModule({
            imports: [
                FormsModule,
                PosterComponent // Standalone component
            ],
            providers: [
                // Ensure MapPinsService is provided via DI
                { provide: 'MapPinsService', useValue: mockMapPinsService }
            ]
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(PosterComponent);
        component = fixture.componentInstance;

        // Set up default state matching the HTML template's expectations
        component.availableAreas = [];
        component.artistColors = [];
        component.aspectRatioOptions = [
            { value: 'a3-portrait', label: 'A3 Portrait' },
            { value: 'a4-portrait', label: 'A4 Portrait' },
            { value: 'a4-landscape', label: 'A4 Landscape' },
            { value: 'square', label: 'Square' }
        ];
        component.aspectRatio = 'a3-portrait';

        fixture.detectChanges();
    });

    it('should create the component', () => {
        expect(component).toBeTruthy();
    });

    it('should display the empty state initially', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const emptyState = compiled.querySelector('.poster-empty');
        expect(emptyState).toBeTruthy();
        expect(emptyState?.textContent).toContain('Choose an area above to preview the poster');
    });

    it('should default to a3-portrait aspect ratio', () => {
        expect(component.aspectRatio).toEqual('a3-portrait');
    });

    it('should call selectArea when an area is chosen', () => {
        spyOn(component, 'selectArea');

        // Populate mock data required by the template
        component.availableAreas = [
            { area: { id: 'athens', displayName: 'Athens', bounds: null }, count: 120 }
        ];
        fixture.detectChanges();

        const areaChip = fixture.nativeElement.querySelector('#area-chip-athens');
        expect(areaChip).toBeTruthy();

        areaChip.click();
        expect(component.selectArea).toHaveBeenCalledWith(component.availableAreas[0].area);
    });
});