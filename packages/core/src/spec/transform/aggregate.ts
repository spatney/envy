/** The `aggregate` transform: group rows and summarize each group into one row. */

import type { Datum } from '../../types';
import type { AggregateTransform } from './types';
import { aggregateValues } from '../../pivot';
import { accessor, toKey } from '../../util/data';

/**
 * Apply an {@link AggregateTransform}. Groups are emitted in first-seen order and
 * keep the **original** group-key values (not stringified). With no `groupby`,
 * the whole dataset collapses to a single summary row.
 */
export function applyAggregate(transform: AggregateTransform, data: Datum[]): Datum[] {
  const groupby = transform.groupby ?? [];
  const reads = groupby.map((f) => accessor(f));

  const emit = (keyValues: unknown[], rows: Datum[]): Datum => {
    const out: Datum = {};
    groupby.forEach((field, i) => {
      out[field] = keyValues[i];
    });
    for (const agg of transform.aggregate) {
      const values = agg.field === undefined ? rows : rows.map((r) => r[agg.field as string]);
      out[agg.as] = aggregateValues(values as unknown[], agg.op);
    }
    return out;
  };

  if (groupby.length === 0) {
    return [emit([], data)];
  }

  const groups = new Map<string, { keys: unknown[]; rows: Datum[] }>();
  for (const row of data) {
    const keyValues = reads.map((read) => read(row));
    const key = keyValues.map((v) => toKey(v)).join('\u0000');
    let group = groups.get(key);
    if (group === undefined) {
      group = { keys: keyValues, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  const out: Datum[] = [];
  for (const group of groups.values()) {
    out.push(emit(group.keys, group.rows));
  }
  return out;
}
