/**
 * Display formatting only. Values come from Univer's calculated results; money is
 * rounded here for display and never before storage.
 */

export function formatMoney(value: number | null | undefined, currency: string, opts: { signed?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const fractionDigits = Number.isInteger(Math.round(abs * 100) / 100) ? 0 : 2;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    }).format(abs);
  } catch {
    formatted = `${abs.toFixed(fractionDigits)} ${currency}`;
  }
  if (value < 0 || Object.is(value, -0)) return `${opts.signed || value < 0 ? '−' : ''}${formatted}`;
  if (opts.signed && value > 0) return `+${formatted}`;
  return formatted;
}

/** Margin is a fraction; null (zero revenue) displays as N/A. */
export function formatMargin(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const pct = value * 100;
  return `${pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`;
}

/** A plain number for input values (units, prices). */
export function formatNumber(value: number | null | undefined, maxFractionDigits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Sign word that accompanies colour, so outcomes never depend on colour alone. */
export function outcomeLabel(value: number | null | undefined): 'Profit' | 'Loss' | 'Break-even' | 'Unknown' {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unknown';
  if (value > 0) return 'Profit';
  if (value < 0) return 'Loss';
  return 'Break-even';
}

/** Accepts "1,250.50", " 3 ", "0"; returns null for anything that is not a finite number. */
export function parseNumberInput(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
