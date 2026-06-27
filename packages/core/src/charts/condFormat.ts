import type { IconRule, ValueRule } from '../spec/types';

export type ConditionalTone = 'up' | 'mid' | 'down';
export type IconSetName = 'arrows' | 'triangles' | 'dots' | 'trafficLights';

export interface RuleStyle {
  background?: string;
  color?: string;
  weight?: 'bold' | 'normal';
  icon?: string;
}

export interface SemanticIcon {
  icon: string;
  tone: ConditionalTone;
}

export function evalRules(raw: number | null, rules: readonly ValueRule[]): RuleStyle;
export function evalRules(raw: number | string | null, rules: readonly ValueRule[]): RuleStyle {
  for (const rule of rules) {
    if (matchesRule(raw, rule)) {
      return {
        background: rule.background,
        color: rule.color,
        weight: rule.weight,
        icon: rule.icon,
      };
    }
  }
  return {};
}

export function iconForValue(
  set: IconSetName = 'arrows',
  raw: number | null,
  domain: [number, number] | null,
  rules?: readonly IconRule[],
): SemanticIcon | null {
  if (raw == null || !Number.isFinite(raw)) return null;

  if (rules && rules.length > 0) {
    const match = rules.find((rule) => matchesRule(raw, rule));
    if (!match) return null;
    return {
      icon: match.icon ?? glyphForTone(set, toneForValue(raw, domain)),
      tone: colorToTone(match.color) ?? toneForValue(raw, domain),
    };
  }

  return {
    icon: glyphForTone(set, toneForValue(raw, domain)),
    tone: toneForValue(raw, domain),
  };
}

export function toneColor(tone: ConditionalTone, colors?: Partial<Record<ConditionalTone, string>>): string {
  if (colors?.[tone]) return colors[tone] as string;
  if (tone === 'up') return '#16a34a';
  if (tone === 'mid') return '#d97706';
  return '#dc2626';
}

function matchesRule(raw: number | string | null, rule: Pick<ValueRule, 'when' | 'value' | 'to'>): boolean {
  if (rule.when === 'eq' || rule.when === 'ne') {
    const match = String(raw) === String(rule.value);
    return rule.when === 'eq' ? match : !match;
  }
  const numericRaw = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numericRaw)) return false;
  const value = Number(rule.value);
  if (!Number.isFinite(value)) return false;
  switch (rule.when) {
    case 'gt':
      return numericRaw > value;
    case 'gte':
      return numericRaw >= value;
    case 'lt':
      return numericRaw < value;
    case 'lte':
      return numericRaw <= value;
    case 'between': {
      const to = Number(rule.to);
      return Number.isFinite(to) && numericRaw >= Math.min(value, to) && numericRaw <= Math.max(value, to);
    }
  }
}

function toneForValue(raw: number, domain: [number, number] | null): ConditionalTone {
  if (!domain) return raw > 0 ? 'up' : raw < 0 ? 'down' : 'mid';
  const [min, max] = domain;
  if (max === min) return 'mid';
  const t = (raw - min) / (max - min);
  if (t < 1 / 3) return 'down';
  if (t < 2 / 3) return 'mid';
  return 'up';
}

function glyphForTone(set: IconSetName, tone: ConditionalTone): string {
  if (set === 'trafficLights' || set === 'dots') return '●';
  if (set === 'triangles') return tone === 'down' ? '▼' : '▲';
  if (tone === 'down') return '▼';
  if (tone === 'mid') return '▬';
  return '▲';
}

function colorToTone(color: string | undefined): ConditionalTone | null {
  if (!color) return null;
  const value = color.toLowerCase();
  if (value.includes('16a34a') || value.includes('green')) return 'up';
  if (value.includes('dc2626') || value.includes('red')) return 'down';
  if (value.includes('d97706') || value.includes('amber') || value.includes('orange')) return 'mid';
  return null;
}
