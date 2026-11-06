import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PropertySummary } from '@api/contracts';

import { aPropertySummary } from '../property-summary.fixture';
import { PropertyCard } from './property-card';

@Component({
  imports: [PropertyCard],
  template: `<hs-property-card [summary]="summary()" />`,
})
class Host {
  public readonly summary = signal<PropertySummary>(aPropertySummary());
}

describe('PropertyCard', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  const card = (): HTMLElement => host.querySelector('hs-property-card')!;
  const text = (): string => card().textContent.replace(/\s+/g, ' ').trim();
  const details = (): string[] =>
    [...card().querySelectorAll('li')].map((item) => item.textContent.trim());
  const show = async (summary: PropertySummary): Promise<void> => {
    fixture.componentInstance.summary.set(summary);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('shows the address, price, size and place', () => {
    expect(card().querySelector('h3')?.textContent.trim()).toBe(
      '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
    );
    expect(text()).toContain('£229,000');
    expect(text()).toContain('3 bedrooms, 2 bathrooms, 1 public room, 97 m²');
    expect(text()).toContain('Aberdeen, AB21');
  });

  it('lists the council tax band, the stated features and the heating', async () => {
    await show(aPropertySummary({ hasGarden: true, hasElectricVehicleChargePoint: true }));

    expect(details()).toEqual(['Council tax band E', 'Garden', 'EV charge point', 'Gas heating']);
  });

  it('says nothing about a feature the listing did not state', async () => {
    await show(aPropertySummary({ heatingType: 'none', councilTaxBand: null }));

    expect(card().querySelector('ul')).toBeNull();
    expect(text()).not.toMatch(/\b(no|not|without|none)\b/i);
    expect(text()).not.toMatch(/garden|garage|parking/i);
  });

  it('leaves out what the listing did not give, with no gaps, zeros or nulls', async () => {
    await show(
      aPropertySummary({
        bedrooms: null,
        bathrooms: null,
        publicRooms: null,
        areaM2: null,
        town: null,
        postcodeDistrict: null,
      }),
    );

    expect(card().querySelectorAll('p')).toHaveLength(0);
    expect(text()).not.toMatch(/null|undefined|\b0\b/);
  });

  it('can take focus from script, is named by its address and has a findable id', () => {
    card().focus();

    expect(document.activeElement).toBe(card());
    expect(card().getAttribute('aria-label')).toBe(
      '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
    );
    expect(card().id).toBe('property-3501');
  });
});
