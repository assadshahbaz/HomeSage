import type { DisclosureRow } from './property-row.js';

/** An answer column that has a `<column>_detail` partner holding the seller's own sentence. */
export type DetailedAnswerColumn = {
  [Column in keyof DisclosureRow]: `${Column}_detail` extends keyof DisclosureRow ? Column : never;
}[keyof DisclosureRow];

/** How one seller answer reads in the document. */
export interface DisclosurePhrase {
  readonly column: DetailedAnswerColumn;
  /** Put in front of the seller's sentence, which often starts "Yes, ..." and names no subject. */
  readonly label: string;
  readonly yes: string;
  /** Only where a no is worth searching for, such as no roof repairs. Otherwise a no writes nothing. */
  readonly no?: string;
}

/**
 * The seller answers that go into the paragraph, in table order. Central
 * heating is not here because the heating sentence combines it with the
 * heating type. Supplies, suppliers and `epc_available` stay out: the first two
 * say little to search on, and an EPC sentence reads like a rating the data
 * does not have.
 */
export const DISCLOSURE_PHRASES: readonly DisclosurePhrase[] = [
  {
    column: 'conservation_area',
    label: 'Conservation area',
    yes: 'In a conservation area.',
    no: 'Not in a conservation area.',
  },
  {
    column: 'listed_building',
    label: 'Listed building',
    yes: 'Listed building.',
    no: 'Not a listed building.',
  },
  { column: 'windows_replaced', label: 'Windows', yes: 'Windows replaced.' },
  {
    column: 'maintenance_contract',
    label: 'Maintenance contract',
    yes: 'Maintenance contract in place.',
  },
  {
    column: 'structural_damage',
    label: 'Structural damage',
    yes: 'Structural damage reported.',
    no: 'No structural damage reported.',
  },
  { column: 'asbestos', label: 'Asbestos', yes: 'Asbestos reported.', no: 'No asbestos reported.' },
  {
    column: 'mains_drainage',
    label: 'Drainage',
    yes: 'Mains drainage.',
    no: 'Not on mains drainage.',
  },
  {
    column: 'shared_cost_responsibility',
    label: 'Shared repair costs',
    yes: 'Shares the cost of common repairs.',
    no: 'No shared repair costs.',
  },
  {
    column: 'major_roof_repairs',
    label: 'Roof repairs',
    yes: 'Major roof repairs reported.',
    no: 'No major roof repairs reported.',
  },
  {
    column: 'common_building_insurance',
    label: 'Buildings insurance',
    yes: 'Common buildings insurance.',
  },
  {
    column: 'other_regular_charges',
    label: 'Regular charges',
    yes: 'Other regular charges apply.',
    no: 'No other regular charges.',
  },
  {
    column: 'specialist_work',
    label: 'Specialist work',
    yes: 'Specialist work reported.',
    no: 'No specialist work reported.',
  },
  { column: 'guarantee_available', label: 'Guarantees', yes: 'Guarantees available.' },
  { column: 'boundaries_moved', label: 'Boundaries', yes: 'Boundaries have moved.' },
  {
    column: 'received_notices',
    label: 'Notices',
    yes: 'Notices received.',
    no: 'No notices received.',
  },
  {
    column: 'public_right_of_way',
    label: 'Right of way',
    yes: 'Public right of way.',
    no: 'No public right of way.',
  },
];
