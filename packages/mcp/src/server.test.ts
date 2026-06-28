import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  renderChartHandler,
  validateChartHandler,
  repairChartHandler,
  summarizeChartHandler,
} from './handlers.js';
import { createServer } from './create-server.js';

const lineSpec = {
  type: 'line',
  data: [
    { month: '2024-01', users: 4200 },
    { month: '2024-02', users: 4650 },
    { month: '2024-03', users: 6010 },
  ],
  encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'users' } },
  title: 'Monthly active users',
};

const kpiSpec = {
  type: 'kpi',
  data: [{ sales: 30 }, { sales: 12 }],
  value: { field: 'sales', aggregate: 'sum' },
  title: 'Total sales',
};

/** PNG bytes, base64-encoded, always begin with this prefix. */
const PNG_B64_PREFIX = 'iVBORw0KGgo';

function textPayload(result: { content: Array<Record<string, unknown>> }) {
  const block = result.content.find((c) => c.type === 'text');
  return JSON.parse(String(block?.text));
}

describe('handlers', () => {
  describe('validateChartHandler', () => {
    it('passes a valid spec', () => {
      const out = validateChartHandler({ spec: lineSpec });
      expect(out.isError).toBe(false);
      const p = textPayload(out);
      expect(p.valid).toBe(true);
      expect(p.errors).toHaveLength(0);
    });

    it('reports errors with a fix patch for an unknown type', () => {
      const out = validateChartHandler({ spec: { ...lineSpec, type: 'bart' } });
      const p = textPayload(out);
      expect(p.valid).toBe(false);
      const typeErr = p.errors.find((e: { path: string }) => e.path === 'type');
      expect(typeErr).toBeTruthy();
      expect(typeErr.fix).toContainEqual({ op: 'replace', path: '/type', value: 'bar' });
      expect(typeErr.suggestion.candidates).toContain('bar');
    });
  });

  describe('repairChartHandler', () => {
    it('repairs a misspelled chart type to a valid spec', () => {
      const out = repairChartHandler({ spec: { ...lineSpec, type: 'bart' } });
      const p = textPayload(out);
      expect(p.valid).toBe(true);
      expect(p.applied).toContainEqual({ op: 'replace', path: '/type', value: 'bar' });
      expect(p.spec.type).toBe('bar');
    });

    it('leaves an already-valid spec untouched', () => {
      const out = repairChartHandler({ spec: lineSpec });
      const p = textPayload(out);
      expect(p.valid).toBe(true);
      expect(p.applied).toHaveLength(0);
    });
  });

  describe('summarizeChartHandler', () => {
    it('produces deterministic prose for a valid spec', () => {
      const out = summarizeChartHandler({ spec: lineSpec });
      expect(out.isError).toBe(false);
      const block = out.content.find((c) => c.type === 'text');
      expect(String(block?.text).length).toBeGreaterThan(0);
      expect(String(block?.text)).toMatch(/users/i);
    });

    it('refuses an invalid spec', () => {
      const out = summarizeChartHandler({ spec: { ...lineSpec, type: 'bart' } });
      expect(out.isError).toBe(true);
    });
  });

  describe('renderChartHandler', () => {
    it('renders a valid spec to a PNG plus a critique', () => {
      const out = renderChartHandler({ spec: lineSpec, width: 640, height: 360, dpr: 1 });
      expect(out.isError).toBe(false);
      const img = out.content.find((c) => c.type === 'image') as
        | { data: string; mimeType: string }
        | undefined;
      expect(img).toBeTruthy();
      expect(img?.mimeType).toBe('image/png');
      expect(img?.data.startsWith(PNG_B64_PREFIX)).toBe(true);
      const p = textPayload(out);
      expect(p.rendered).toBe(true);
      expect(p.type).toBe('line');
      expect(p.pixelSize).toEqual({ width: 640, height: 360 });
      expect(typeof p.summary).toBe('string');
      expect(Array.isArray(p.diagnostics)).toBe(true);
      expect(p.marks).toBeGreaterThan(0);
    });

    it('returns errors with fixes (no image) for an unrepairable spec', () => {
      const out = renderChartHandler({ spec: { type: 'line' }, repair: false });
      expect(out.isError).toBe(true);
      expect(out.content.some((c) => c.type === 'image')).toBe(false);
      const p = textPayload(out);
      expect(p.rendered).toBe(false);
      expect(p.stage).toBe('validate');
      expect(p.errors.length).toBeGreaterThan(0);
    });

    it('labels a spec with no type as "(missing)"', () => {
      const out = renderChartHandler({ spec: { data: [{ a: 1 }] }, repair: false });
      expect(out.isError).toBe(true);
      const p = textPayload(out);
      expect(p.stage).toBe('validate');
      expect(p.type).toBe('(missing)');
    });

    it('auto-repairs a fixable spec before rendering', () => {
      const out = renderChartHandler({ spec: { ...lineSpec, type: 'bart' }, dpr: 1 });
      expect(out.isError).toBe(false);
      const p = textPayload(out);
      expect(p.rendered).toBe(true);
      expect(p.type).toBe('bar');
      expect(p.repairsApplied).toContainEqual({ op: 'replace', path: '/type', value: 'bar' });
    });

    it('gracefully handles a DOM-only visual with no headless image', () => {
      const out = renderChartHandler({ spec: kpiSpec });
      expect(out.isError).toBe(false);
      expect(out.content.some((c) => c.type === 'image')).toBe(false);
      const p = textPayload(out);
      expect(p.rendered).toBe(false);
      expect(p.type).toBe('kpi');
      expect(String(p.reason)).toMatch(/DOM-only/);
    });
  });
});

describe('createServer (in-memory round trip)', () => {
  async function connected() {
    const server = createServer();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { server, client };
  }

  it('advertises the four loop tools', async () => {
    const { client } = await connected();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['render_chart', 'repair_chart', 'summarize_chart', 'validate_chart']);
  });

  it('renders a chart end to end, returning an image and a critique', async () => {
    const { client } = await connected();
    const res = (await client.callTool({
      name: 'render_chart',
      arguments: { spec: lineSpec, width: 480, height: 300, dpr: 1 },
    })) as { isError?: boolean; content: Array<Record<string, unknown>> };
    expect(res.isError).toBeFalsy();
    const img = res.content.find((c) => c.type === 'image') as { data: string } | undefined;
    expect(img?.data.startsWith(PNG_B64_PREFIX)).toBe(true);
    const payload = JSON.parse(String(res.content.find((c) => c.type === 'text')?.text));
    expect(payload.rendered).toBe(true);
    expect(payload.type).toBe('line');
  });

  it('serves the schema + guide resources at runtime', async () => {
    const { client } = await connected();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['graphein://agent-guide', 'graphein://schema', 'graphein://spec-reference']);

    const schema = await client.readResource({ uri: 'graphein://schema' });
    const parsed = JSON.parse(String((schema.contents[0] as { text?: string }).text));
    expect(parsed.$defs).toBeTruthy();
    expect(typeof parsed.$id).toBe('string');

    const guide = await client.readResource({ uri: 'graphein://agent-guide' });
    expect(String((guide.contents[0] as { text?: string }).text)).toMatch(/Graphein/);
  });

  it('exposes a create_chart prompt that teaches the workflow', async () => {
    const { client } = await connected();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('create_chart');
    const prompt = await client.getPrompt({
      name: 'create_chart',
      arguments: { goal: 'monthly active users' },
    });
    const text = String((prompt.messages[0].content as { text?: string }).text);
    expect(text).toMatch(/monthly active users/);
    expect(text).toMatch(/render_chart/);
  });
});
