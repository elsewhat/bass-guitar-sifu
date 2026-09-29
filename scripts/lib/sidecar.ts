// song.yaml loading and validation (ADR-0013).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import type { FingeringOverride } from '../../src/core/fingering';

export interface Sidecar {
  title: string;
  artist: string;
  source: { file: string; date?: string };
  bassTrack: string | number;
  tempo?: { note?: string | null };
  media?: {
    youtube?: { videoId?: string | null; sync?: { bar: number; tick?: number; ms: number }[] };
    music?: { source: string; offsetMs: number };
  };
  chunks: { name: string; bars: [number, number] }[];
  fingeringOverrides?: FingeringOverride[];
  notes?: string;
}

const schemaPath = fileURLToPath(new URL('../../schemas/song.schema.json', import.meta.url));
const ajv = new Ajv2020({ allErrors: true });
addFormats.default(ajv);
const validate = ajv.compile<Sidecar>(JSON.parse(readFileSync(schemaPath, 'utf8')));

export function parseSidecar(text: string, label: string): Sidecar {
  const data: unknown = parse(text);
  if (!validate(data)) {
    const errors = (validate.errors ?? []).map((e) => `  ${e.instancePath || '/'} ${e.message}`).join('\n');
    throw new Error(`${label} is invalid:\n${errors}`);
  }
  return data;
}

export function loadSidecar(file: string): Sidecar {
  return parseSidecar(readFileSync(file, 'utf8'), file);
}
