const POUNDS = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

/** A whole pound price as the UK writes it: `229000` gives "£229,000". */
export function formatPrice(pounds: number): string {
  return POUNDS.format(pounds);
}
