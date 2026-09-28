/**
 * Deterministic, diff-friendly JSON (ADR-0014): objects indented by 2 spaces, and arrays of
 * objects or arrays written one element per line in compact form.
 */
export function stableJson(value: unknown): string {
  return `${format(value, '')}\n`;
}

function format(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) return JSON.stringify(value);
    const inner = indent + '  ';
    return `[\n${value.map((v) => inner + JSON.stringify(v)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const inner = indent + '  ';
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}
