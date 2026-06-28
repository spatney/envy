import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('graphein-mcp public surface', () => {
  it('re-exports the server factory and version', () => {
    expect(typeof api.createServer).toBe('function');
    expect(typeof api.VERSION).toBe('string');
  });

  it('re-exports the four loop handlers', () => {
    expect(typeof api.renderChartHandler).toBe('function');
    expect(typeof api.validateChartHandler).toBe('function');
    expect(typeof api.repairChartHandler).toBe('function');
    expect(typeof api.summarizeChartHandler).toBe('function');
  });

  it('re-exports the resource registry helpers', () => {
    expect(Array.isArray(api.RESOURCES)).toBe(true);
    expect(api.RESOURCES.length).toBeGreaterThan(0);
    expect(typeof api.readResourceFile).toBe('function');
    expect(typeof api.resourceByUri).toBe('function');
    // Every advertised resource resolves to a uri + name.
    for (const r of api.RESOURCES) {
      expect(typeof r.uri).toBe('string');
      expect(api.resourceByUri(r.uri)).toBeTruthy();
    }
  });
});
