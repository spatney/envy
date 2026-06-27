/**
 * Shared helpers for slicer renderers.
 *
 * Slicers are {@link CustomRenderer}s that publish a {@link SelectionValue} to a
 * named param on the shared store. These helpers resolve the param name, the
 * unfiltered option source, and the current value, and centralize publishing so
 * every slicer behaves consistently.
 */

import type { Datum } from '../../types';
import type { RenderContext } from '../index';
import type { BaseSlicerSpec } from '../../spec/types';
import type { SelectionValue } from '../../spec/selection';
import { uniqueValues } from '../../util/data';

/** The param a slicer publishes to: explicit `param`, else the field name. */
export function slicerParam(spec: BaseSlicerSpec): string {
  return spec.param ?? spec.field;
}

/** The accessible/display label for a slicer's control. */
export function slicerLabel(spec: BaseSlicerSpec): string {
  if (spec.label) return spec.label;
  if (typeof spec.title === 'string') return spec.title;
  if (spec.title && typeof spec.title === 'object' && spec.title.text) return spec.title.text;
  return spec.field;
}

/**
 * The rows a slicer derives its options/bounds from — always the *unfiltered*
 * source so the slicer doesn't hide its own choices (or collapse its range) by
 * filtering itself. Falls back to the spec's own data when no context is given.
 */
export function slicerSource(spec: BaseSlicerSpec, context?: RenderContext): Datum[] {
  return context?.sourceData ?? spec.data ?? [];
}

/** Distinct values of the slicer's field, in first-seen order. */
export function slicerOptions(spec: BaseSlicerSpec, context?: RenderContext): unknown[] {
  return uniqueValues(slicerSource(spec, context), spec.field);
}

/** The slicer's current published value (from the store), or null. */
export function currentValue(spec: BaseSlicerSpec, context?: RenderContext): SelectionValue | null {
  return context?.store?.get(slicerParam(spec)) ?? null;
}

/** Publish a new value to the slicer's param (null clears it). */
export function publish(
  spec: BaseSlicerSpec,
  context: RenderContext | undefined,
  value: SelectionValue | null,
): void {
  context?.store?.set(slicerParam(spec), value);
}

/** Render a small notice when a slicer is misconfigured or has no options. */
export function emptyNotice(host: HTMLElement, message: string, color: string): void {
  const note = document.createElement('div');
  note.textContent = message;
  note.style.color = color;
  note.style.fontStyle = 'italic';
  host.appendChild(note);
}
