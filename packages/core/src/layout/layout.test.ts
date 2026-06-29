import { describe, expect, it } from 'vitest';
import { computeFrame } from './frame';
import { lightTheme } from '../theme';
import type { Insets } from '../types';

const padding: Insets = { top: 8, right: 8, bottom: 8, left: 8 };

describe('layout/computeFrame', () => {
  it('returns the padded rect when nothing is reserved', () => {
    const f = computeFrame({ width: 400, height: 300, padding, font: lightTheme.font });
    expect(f.plot).toEqual({ x: 8, y: 8, width: 384, height: 284 });
  });

  it('reserves space for a title above the plot', () => {
    const f = computeFrame({
      width: 400,
      height: 300,
      padding,
      font: lightTheme.font,
      title: { text: 'Revenue' },
    });
    expect(f.titleRect).toBeDefined();
    expect(f.plot.y).toBeGreaterThan(8);
    expect(f.plot.height).toBeLessThan(284);
  });

  it('reserves left gutter for the y axis and bottom for the x axis', () => {
    const f = computeFrame({
      width: 400,
      height: 300,
      padding,
      font: lightTheme.font,
      xAxis: { show: true, labels: ['Jan', 'Feb', 'Mar'] },
      yAxis: { show: true, labels: ['0', '5,000', '10,000'] },
    });
    expect(f.plot.x).toBeGreaterThan(8); // y-axis gutter
    expect(f.plot.y + f.plot.height).toBeLessThan(292); // x-axis gutter
  });

  it('positions legend items and reserves a band', () => {
    const f = computeFrame({
      width: 500,
      height: 300,
      padding,
      font: lightTheme.font,
      legend: {
        position: 'bottom',
        items: [
          { label: 'West', color: '#f00' },
          { label: 'East', color: '#0f0' },
        ],
      },
    });
    expect(f.legendRect).toBeDefined();
    expect(f.legendItems).toHaveLength(2);
    expect(f.plot.height).toBeLessThan(284); // band reserved at the bottom
  });

  it('never produces a negative plot size when crowded', () => {
    const f = computeFrame({
      width: 60,
      height: 50,
      padding,
      font: lightTheme.font,
      title: { text: 'Tiny', subtitle: 'really small' },
      xAxis: { show: true, labels: ['a'], title: 'x' },
      yAxis: { show: true, labels: ['100000'], title: 'y' },
    });
    expect(f.plot.width).toBeGreaterThanOrEqual(0);
    expect(f.plot.height).toBeGreaterThanOrEqual(0);
  });

  it('keeps category labels flat when they fit', () => {
    const f = computeFrame({
      width: 800,
      height: 300,
      padding,
      font: lightTheme.font,
      xAxis: { show: true, labels: ['Jan', 'Feb', 'Mar', 'Apr'] },
    });
    expect(f.xLabelAngle).toBe(0);
  });

  it('auto-rotates categorical labels to 45° when they would not fit', () => {
    const cats = Array.from({ length: 12 }, (_, i) => `Quarterly region ${i}`);
    const f = computeFrame({
      width: 320,
      height: 300,
      padding,
      font: lightTheme.font,
      xAxis: { show: true, labels: cats },
    });
    expect(f.xLabelAngle).toBe(45);
    expect(f.plot.height).toBeGreaterThan(0); // diagonal gutter still leaves room
  });

  it('does not auto-rotate edge-anchored (time/linear) labels', () => {
    const cats = Array.from({ length: 12 }, (_, i) => `2024-0${i}`);
    const f = computeFrame({
      width: 320,
      height: 300,
      padding,
      font: lightTheme.font,
      xAxis: { show: true, labels: cats, edgeAnchored: true },
    });
    expect(f.xLabelAngle).toBe(0);
  });

  it('honors an explicit labelAngle and reserves a taller gutter than flat', () => {
    const labels = ['Northwest', 'Southwest', 'Northeast', 'Southeast'];
    const flat = computeFrame({ width: 800, height: 300, padding, font: lightTheme.font, xAxis: { show: true, labels, labelAngle: 0 } });
    const vert = computeFrame({ width: 800, height: 300, padding, font: lightTheme.font, xAxis: { show: true, labels, labelAngle: 90 } });
    expect(vert.xLabelAngle).toBe(90);
    expect(vert.plot.height).toBeLessThan(flat.plot.height);
  });
});
