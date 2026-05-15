// Citations database loader. Reads `src/data/citations.json` at module init.
//
// citations.json is NOT in the rules-hash set (per dispatch spec §"locked
// decision #7") — it's documentation provenance, not classification rules.
//
// Mirrors the readFileSync + fileURLToPath pattern used by other JSON loaders.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/util/citations.js → ../data/citations.json
const DATA_DIR = join(__dirname, '..', 'data');

export interface CitationEntry {
  label_en: string;
  label_de: string;
  eur_lex_html_en: string;
  eur_lex_html_de: string;
  eur_lex_pdf_en: string;
  eur_lex_pdf_de: string;
  service_desk_en: string | null;
  service_desk_de: string | null;
  lucairn_commentary_en: string | null;
  lucairn_commentary_de: string | null;
}

export interface CitationsMeta {
  version: string;
  primary_source: string;
  primary_pdf_en: string;
  primary_pdf_de: string;
  commentary_publisher: string;
  _provenance_notice: string;
}

/** Article IDs covered by the citations database. */
export type CitationArticleId =
  | 'article_5'
  | 'annex_iii'
  | 'article_10'
  | 'article_12'
  | 'article_13'
  | 'article_14'
  | 'article_15'
  | 'article_50'
  | 'annex_iv';

export interface CitationsData {
  _meta: CitationsMeta;
  article_5: CitationEntry;
  annex_iii: CitationEntry;
  article_10: CitationEntry;
  article_12: CitationEntry;
  article_13: CitationEntry;
  article_14: CitationEntry;
  article_15: CitationEntry;
  article_50: CitationEntry;
  annex_iv: CitationEntry;
}

function loadCitations(): CitationsData {
  const path = join(DATA_DIR, 'citations.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as CitationsData;
}

const CITATIONS: CitationsData = loadCitations();

export function getCitations(): CitationsData {
  return CITATIONS;
}

export function getCitation(id: CitationArticleId): CitationEntry {
  return CITATIONS[id];
}

/**
 * Test helper — re-read citations.json from disk.
 * @internal
 */
export function _reloadCitations(): void {
  const fresh = loadCitations();
  Object.assign(CITATIONS, fresh);
}
