export function formatNumber(value: number, precision = 12): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (value === 0) {
    return '0';
  }

  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) {
    return value.toExponential(Math.max(0, Math.min(precision, 6))).replace(/\.?0+e/, 'e');
  }

  return value
    .toFixed(Math.max(0, Math.min(precision, 12)))
    .replace(/\.?0+$/, '');
}

export function precisionFromStep(step: number): number {
  if (!Number.isFinite(step) || step === 0) {
    return 12;
  }

  return Math.max(0, Math.min(12, -Math.floor(Math.log10(Math.abs(step))) + 2));
}
