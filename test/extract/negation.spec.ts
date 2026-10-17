// Negation detection (after v0.3.1) — src/extract/negation.ts via extractFeatures().
// ADVISORY ONLY (PRD Amendment 1, Marc 2026-10-17): every phrase fires exactly
// as in v0.3.1; a phrase that stands near a negation additionally carries the
// note "Found, but the text appears to deny it — please check" in
// `negatedHits` / `negated_hits`. The verdict guard (identical to the
// pre-negation engine) lives in negation-safety.spec.ts.
//
// Every noted case is paired with a positive control (fires, no note) so a
// test cannot pass just because the phrase is missing from the lexicon.

import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classify } from '../../src/classify.js';
import { findNegated, isNegationLexicon } from '../../src/extract/negation.js';
import { formatMarkdown } from '../../src/format/markdown.js';
import { formatExplain } from '../../src/format/explain.js';
import { formatCliTable } from '../../src/format/cli-table.js';
import { negatedHitRef, noteRow } from '../../src/util/negated-hits.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data');
const EN_LEXICON = JSON.parse(readFileSync(join(DATA, 'patterns.en.json'), 'utf8')) as Record<string, unknown>;
const DE_LEXICON = JSON.parse(readFileSync(join(DATA, 'patterns.de.json'), 'utf8')) as Record<string, unknown>;

function phrases(text: string, lang: 'en' | 'de'): string[] {
  return extractFeatures(text, { lang }).hits.map((h) => h.phrase);
}

function noted(text: string, lang: 'en' | 'de'): string[] {
  return (extractFeatures(text, { lang }).negatedHits ?? []).map((h) => h.phrase);
}

type Case = { text: string; phrase: string };

/** [negated sentence, positive control] — the phrase fires in both; only the negated one carries the note. */
function expectNoted(lang: 'en' | 'de', negated: Case, control: Case): void {
  expect(phrases(control.text, lang), `control should fire: ${control.text}`).toContain(control.phrase);
  expect(noted(control.text, lang), `control should carry no note: ${control.text}`).not.toContain(control.phrase);
  expect(phrases(negated.text, lang), `negated should STILL fire: ${negated.text}`).toContain(negated.phrase);
  expect(noted(negated.text, lang), `negated should carry the note: ${negated.text}`).toContain(negated.phrase);
}

/** Cue governs the phrase but the sentence continues: fires (as always) AND carries the note. */
const NOTED_OPEN = new Set([
  'neither … nor as a subject with a predicate (open construction)',
  'continuation after the phrase: only by …',
  'continuation after the phrase: preposition',
  'subject + predicate',
  'subject + predicate: no X is used',
  'gerund subject',
  'and-list followed by a predicate',
  'comma + affirmative clause',
  'ohne + Phrase + Verb (offene Konstruktion)',
  'weder … noch als Subjekt mit Prädikat',
  'Subjekt + Prädikat',
  'Partizip, aber Satz geht weiter',
  'allein nach der Phrase',
]);

const NOTE_EN = 'Found, but the text appears to deny it — please check';
const NOTE_DE = 'Gefunden, aber der Text scheint es zu verneinen — bitte prüfen';

describe('negation — the two reported sentences (classify end-to-end): fire as on main, with the note', () => {
  it('EN "Our CV tool does NOT rank job applicants." stays HIGH-RISK Annex III.4 and carries the note', async () => {
    const r = await classify('Our CV tool does NOT rank job applicants.');
    expect(r.annex_iii.high_risk).toBe(true);
    expect(r.annex_iii.domains.map((d) => d.annex_iii_number)).toEqual([4]);
    expect(r.annex_iv_required).toBe(true);
    expect(r.negated_hits).toEqual([
      expect.objectContaining({ phrase: 'rank job applicants', group: 'annex_iii', ref: 'Annex III.4', cue: 'not' }),
    ]);
    const control = await classify('Our CV tool ranks job applicants.');
    expect(control.annex_iii.high_risk).toBe(true);
    expect(control.negated_hits).toEqual([]);
  });

  it('EN "A chatbot that does not use emotion recognition and does not do social scoring." stays PROHIBITED and carries the note', async () => {
    const r = await classify(
      'A chatbot that does not use emotion recognition and does not do social scoring.',
    );
    expect(r.article_5.prohibited).toBe(true);
    expect(r.article_5.hits.map((h) => h.letter)).toEqual(['c']);
    expect(r.article_50.applicable).toBe(true);
    expect(r.article_50.triggered_by.paragraph_1_interaction).toBe(true);
    expect(r.negated_hits).toContainEqual(
      expect.objectContaining({ phrase: 'social scoring', ref: 'Art 5(1)(c)', cue: 'not do' }),
    );
    expect(r.negated_hits).toContainEqual(expect.objectContaining({ phrase: 'emotion recognition', cue: 'not use' }));
  });

  it('the note is shown directly under the affected result line (table, markdown, --explain; EN + DE)', async () => {
    const en = await classify('Our CV tool does NOT rank job applicants.', { lang: 'en' });
    const table = formatCliTable(en, { locale: 'en', cite: false, useColor: false }).split('\n');
    const note = `⚠ ${NOTE_EN}: "rank job applicants" (Annex III.4; negation: "not")`;
    const noteAt = table.findIndex((l) => l.includes(note));
    expect(noteAt).toBeGreaterThan(0);
    // Directly under the Annex III line and its sub-letter tree.
    expect(table[noteAt - 1]).toContain('Annex III.4(a)');
    expect(table[noteAt - 2]).toContain('HIGH-RISK');

    const md = formatMarkdown(en, { locale: 'en', cite: false }).split('\n');
    const annexRow = md.find((l) => l.startsWith('| Article 6'));
    expect(annexRow).toContain(`⚠️ ${NOTE_EN}: "rank job applicants" (Annex III.4; negation: "not")`);

    const ex = formatExplain(en, { locale: 'en', format: 'markdown', withExcerpt: false }).split('\n');
    const head = ex.findIndex((l) => l.startsWith('### Annex III ¶4'));
    const exNote = ex.findIndex((l) => l.includes(NOTE_EN));
    expect(head).toBeGreaterThan(0);
    expect(exNote).toBeGreaterThan(head);
    expect(ex.slice(head + 1, exNote).some((l) => l.startsWith('### '))).toBe(false);
    const text = formatExplain(en, { locale: 'en', format: 'text', withExcerpt: false });
    expect(text).toContain(`* ⚠ ${NOTE_EN}: "rank job applicants"`);
    expect(JSON.parse(formatExplain(en, { locale: 'en', format: 'json', withExcerpt: false })).negated_hits).toHaveLength(1);

    const de = await classify('Es findet keine Sozialbewertung statt.', { lang: 'de' });
    const deTable = formatCliTable(de, { locale: 'de', cite: false, useColor: false }).split('\n');
    const deAt = deTable.findIndex((l) => l.includes(NOTE_DE));
    expect(deTable[deAt - 1]).toMatch(/^  Artikel 5/);
    expect(deTable[deAt]).toContain('"sozialbewertung" (Art. 5 Abs. 1 Buchst. c; Verneinung: "keine")');
    expect(formatMarkdown(de, { locale: 'de', cite: false }).split('\n').find((l) => l.startsWith('| Artikel 5'))).toContain(NOTE_DE);
    expect(formatExplain(de, { locale: 'de', format: 'markdown', withExcerpt: false })).toContain(NOTE_DE);
  });

  it('DE equivalents fire as on main and carry the note', async () => {
    const a = await classify('Das Tool soll nicht Bewerber sortieren.', { lang: 'de' });
    expect(a.annex_iii.high_risk).toBe(true);
    expect(a.negated_hits.map((h) => h.phrase)).toContain('bewerber sortieren');
    const b = await classify(
      'Ein Chatbot, der keine Emotionserkennung am Arbeitsplatz nutzt und keine Sozialbewertung betreibt.',
      { lang: 'de' },
    );
    expect(b.article_5.prohibited).toBe(true);
    expect(b.negated_hits.map((h) => h.phrase)).toContain('emotionserkennung am arbeitsplatz');
  });
});

describe('negation — EN forms', () => {
  const rank = 'rank job applicants';
  it.each([
    ['not', 'Our tool will not rank job applicants.', 'Our tool will rank job applicants.', rank],
    ['NOT (upper case)', 'Our tool does NOT rank job applicants.', 'Our tool does rank job applicants.', rank],
    ['does not', 'The system does not rank job applicants.', 'The system does rank job applicants.', rank],
    ["doesn't", "The system doesn't rank job applicants.", 'The system does rank job applicants.', rank],
    ["doesn’t (curly apostrophe)", 'The system doesn’t rank job applicants.', 'The system does rank job applicants.', rank],
    ["don't", "We don't rank job applicants.", 'We rank job applicants.', rank],
    ['we do not', 'We do not rank job applicants.', 'We do rank job applicants.', rank],
    ["won't", "It won't rank job applicants.", 'It will rank job applicants.', rank],
    ["can't", "It can't rank job applicants.", 'It can rank job applicants.', rank],
    ['cannot', 'It cannot rank job applicants.', 'It can rank job applicants.', rank],
    ['never', 'We never rank job applicants.', 'We always rank job applicants.', rank],
    ['no', 'There is no facial recognition.', 'There is facial recognition.', 'facial recognition'],
    ['no + determiner/modifier', 'There is no such automated facial recognition.', 'There is such automated facial recognition.', 'facial recognition'],
    ['not + governed verb', 'We do not use facial recognition.', 'We use facial recognition.', 'facial recognition'],
    ['never + governed verb (past)', 'We never used facial recognition.', 'We used facial recognition.', 'facial recognition'],
    ['not to + governed verb', 'We decided not to use facial recognition.', 'We decided to use facial recognition.', 'facial recognition'],
    ["isn't (is not + phrase)", "It isn't facial recognition.", 'It is facial recognition.', 'facial recognition'],
    ['and-list ending the clause', 'We do not use emotion recognition and facial recognition.', 'We use emotion recognition and facial recognition.', 'facial recognition'],
    ['handover to a further negated clause', 'We do not use facial recognition and we never do social scoring.', 'We use facial recognition and we do social scoring.', 'facial recognition'],
  ])('%s', (_label, negated, control, phrase) => {
    expectNoted('en', { text: negated, phrase }, { text: control, phrase });
  });

  it('neither … nor notes both items (closed: the list ends the clause); both still fire', () => {
    const t = 'We use neither social scoring nor emotion recognition.';
    expect(phrases(t, 'en')).toEqual(expect.arrayContaining(['social scoring', 'emotion recognition']));
    expect(noted(t, 'en')).toEqual(expect.arrayContaining(['social scoring', 'emotion recognition']));
    const c = phrases('Social scoring and emotion recognition are part of it.', 'en');
    expect(c).toContain('social scoring');
    expect(c).toContain('emotion recognition');
  });

  it('without notes the next phrase only; both still fire', () => {
    const t = 'We rank job applicants without facial recognition.';
    expect(phrases(t, 'en')).toEqual(expect.arrayContaining([rank, 'facial recognition']));
    expect(noted(t, 'en')).toEqual(['facial recognition']);
    expect(phrases('We rank job applicants with facial recognition.', 'en')).toContain('facial recognition');
  });

  it('a comma-separated list closed by "or" notes every member; all still fire', () => {
    const t = 'We do not use emotion recognition, facial recognition or social scoring.';
    const all = ['emotion recognition', 'facial recognition', 'social scoring'];
    expect(phrases(t, 'en')).toEqual(expect.arrayContaining(all));
    expect(noted(t, 'en')).toEqual(expect.arrayContaining(all));
  });

  it.each([
    ['is not used', 'Facial recognition is not used.'],
    ["isn't used", "Facial recognition isn't used."],
    ['will never be performed', 'Facial recognition will never be performed.'],
    ['cannot be used', 'Facial recognition cannot be used.'],
    ['has not been deployed', 'Facial recognition has not been deployed.'],
  ])('trailing denial: "%s"', (_label, text) => {
    expectNoted(
      'en',
      { text, phrase: 'facial recognition' },
      { text: 'Facial recognition is used.', phrase: 'facial recognition' },
    );
  });
});

describe('negation — EN: always fires; note only where a cue governs the phrase', () => {
  it.each([
    ['not only … but also', 'Our tool not only ranks job applicants but also schedules interviews.', 'ranks job applicants'],
    ['cannot be used without human review (trigger before)', 'The system ranks job applicants and cannot be used without human review.', 'ranks job applicants'],
    ['relative clause + cannot … without', 'Our tool, which ranks job applicants, cannot be used without human review.', 'ranks job applicants'],
    ['double negation: does not … without', 'The tool does not rank job applicants without a recruiter sign-off.', 'rank job applicants'],
    ['double negation in a trailing denial', 'Facial recognition cannot be used without a court order.', 'facial recognition'],
    ['negation in an earlier sentence', 'We do not store CVs. Our tool ranks job applicants.', 'ranks job applicants'],
    ['negation before a comma (no list)', 'We do not store CVs, our tool ranks job applicants.', 'ranks job applicants'],
    ['negation before "but"', 'We do not store CVs but our tool ranks job applicants.', 'ranks job applicants'],
    ['negation in a coordinated clause', 'It does not store CVs and ranks job applicants.', 'ranks job applicants'],
    ['negated verb after the phrase is not a denial of the phrase', 'Our facial recognition does not store images.', 'facial recognition'],
    ['"is not only used"', 'Facial recognition is not only used for access control.', 'facial recognition'],
    ['without-phrase inside the lexicon phrase', 'Grading is done without human review of the results; we rank job applicants.', 'rank job applicants'],
    // Governed-only: anything between cue and phrase that is not an allowlisted
    // auxiliary / governed verb / determiner / modifier means NOT governed.
    ['subject between cue and phrase', 'Neither model will rank job applicants.', 'rank job applicants'],
    ['non-governed verb between cue and phrase', "It isn't able to rank job applicants.", 'rank job applicants'],
    ['avoidance verb', 'Employees cannot opt out of emotion recognition in the workplace.', 'emotion recognition in the workplace'],
    ['subordinator', 'Users are not told that we use facial recognition.', 'facial recognition'],
    ['limiter: not exclusively', 'The system does not exclusively evaluate creditworthiness.', 'creditworthiness'],
    ['limiter: not simply', 'It is not simply facial recognition.', 'facial recognition'],
    ['fixed non-denial: not limited to', 'Features include but are not limited to facial recognition.', 'facial recognition'],
    ['fixed non-denial: no limits on', 'We impose no limits on facial recognition.', 'facial recognition'],
    ['dash between clauses', 'No more manual screening - the AI ranks job applicants.', 'ranks job applicants'],
    ['bullet between clauses', 'No cloud • ranks job applicants', 'ranks job applicants'],
    ['without + non-phrase + phrase', 'Without human review the tool ranks job applicants.', 'ranks job applicants'],
    ['trailing: predicate does not end the clause', 'Facial recognition is not used for marketing purposes.', 'facial recognition'],
    ['trailing: complement after the predicate (known limit)', "Facial recognition isn't used in this product.", 'facial recognition'],
    ['trailing: not optional', 'Facial recognition is not optional.', 'facial recognition'],
    ['trailing: cannot be disabled', 'Facial recognition cannot be disabled.', 'facial recognition'],
    ['trailing: cancelled by "only"', 'Facial recognition is not used, only tested.', 'facial recognition'],
    ['trailing: cancelled by "but"', 'Facial recognition is not used, but emotion recognition is.', 'facial recognition'],
    ['double negation in one clause', 'There is no case in which the system does not rank job applicants.', 'rank job applicants'],
    ['double negation across a relative clause', 'There is no case, in which the system does not rank job applicants.', 'rank job applicants'],
    ['neither … nor as a subject with a predicate (open construction)', 'Neither social scoring nor emotion recognition is part of it.', 'social scoring'],
    ['continuation after the phrase: only by …', 'We do not rank job applicants only by experience; age is also scored.', 'rank job applicants'],
    ['continuation after the phrase: preposition', 'We do not use facial recognition in this product.', 'facial recognition'],
    ['subject + predicate', 'No credit scoring request is left unprocessed.', 'credit scoring'],
    ['subject + predicate: no X is used', 'No facial recognition is used.', 'facial recognition'],
    ['gerund subject', 'Not using social scoring is impossible.', 'social scoring'],
    ['list followed by an affirmative clause', 'We do not offer facial recognition, social scoring or credit scoring is used instead.', 'social scoring'],
    ['and-list followed by a predicate', 'We do not use emotion recognition and facial recognition is used instead.', 'emotion recognition'],
    ['comma + affirmative clause', 'We do not use facial recognition, we use social scoring.', 'facial recognition'],
  ])('%s', (label, text, phrase) => {
    expect(phrases(text, 'en')).toContain(phrase);
    expect(noted(text, 'en').includes(phrase), `note expected: ${NOTED_OPEN.has(label)}`).toBe(NOTED_OPEN.has(label));
  });
});

describe('negation — DE forms', () => {
  const sort = 'bewerber sortieren';
  it.each([
    ['nicht', 'Das Tool soll nicht Bewerber sortieren.', 'Das Tool soll Bewerber sortieren.', sort],
    ['nie', 'Das Tool soll nie Bewerber sortieren.', 'Das Tool soll Bewerber sortieren.', sort],
    ['niemals', 'Wir setzen niemals Gesichtserkennung ein.', 'Wir setzen Gesichtserkennung ein.', 'gesichtserkennung'],
    ['kein', 'Es findet kein Bewerber-Ranking statt.', 'Es findet ein Bewerber-Ranking statt.', 'bewerber-ranking'],
    ['keine (Art 5 Sozialbewertung)', 'Es findet keine Sozialbewertung statt.', 'Es findet Sozialbewertung statt.', 'sozialbewertung'],
    ['keine', 'Das System nutzt keine Emotionserkennung.', 'Das System nutzt Emotionserkennung.', 'emotionserkennung'],
    ['keine + Adjektiv', 'Das System nutzt keine biometrische Kategorisierung.', 'Das System nutzt biometrische Kategorisierung.', 'biometrische kategorisierung'],
    ['nicht + Artikel', 'Das System nutzt nicht die Gesichtserkennung.', 'Das System nutzt die Gesichtserkennung.', 'gesichtserkennung'],
    ['ohne', 'Das System arbeitet ohne Gesichtserkennung.', 'Das System arbeitet mit Gesichtserkennung.', 'gesichtserkennung'],
    ['keine … nutzt (Verbletzt)', 'Ein Tool, das keine Gesichtserkennung nutzt.', 'Ein Tool, das Gesichtserkennung nutzt.', 'gesichtserkennung'],
    ['keine … Partizip am Satzende', 'Es wird keine Sozialbewertung durchgeführt.', 'Es wird Sozialbewertung durchgeführt.', 'sozialbewertung'],
    ['nachgestellt: wird nicht eingesetzt', 'Gesichtserkennung wird nicht eingesetzt.', 'Gesichtserkennung wird eingesetzt.', 'gesichtserkennung'],
    ['nachgestellt: darf nicht eingesetzt werden', 'Gesichtserkennung darf nicht eingesetzt werden.', 'Gesichtserkennung darf eingesetzt werden.', 'gesichtserkennung'],
    ['nachgestellt: wird bei uns nicht genutzt', 'Gesichtserkennung wird bei uns nicht genutzt.', 'Gesichtserkennung wird bei uns genutzt.', 'gesichtserkennung'],
    ['nachgestellt: nutzen … nicht', 'Wir nutzen Emotionserkennung nicht.', 'Wir nutzen Emotionserkennung.', 'emotionserkennung'],
    ['nachgestellt: setzen … nicht ein', 'Wir setzen Gesichtserkennung nicht ein.', 'Wir setzen Gesichtserkennung ein.', 'gesichtserkennung'],
  ])('%s', (_label, negated, control, phrase) => {
    expectNoted('de', { text: negated, phrase }, { text: control, phrase });
  });

  it('weder … noch notes both items; both still fire', () => {
    const t = 'Wir nutzen weder Emotionserkennung noch Sozialbewertung.';
    expect(phrases(t, 'de')).toEqual(expect.arrayContaining(['emotionserkennung', 'sozialbewertung']));
    expect(noted(t, 'de')).toEqual(expect.arrayContaining(['emotionserkennung', 'sozialbewertung']));
  });

  it('noch alone is not a negation', () => {
    expect(phrases('Gesichtserkennung wird noch eingesetzt.', 'de')).toContain('gesichtserkennung');
    expect(noted('Gesichtserkennung wird noch eingesetzt.', 'de')).toEqual([]);
  });

  it('a comma list closed by "oder" notes every member; all still fire', () => {
    const t = 'Wir nutzen keine Emotionserkennung, Gesichtserkennung oder Sozialbewertung.';
    const all = ['emotionserkennung', 'gesichtserkennung', 'sozialbewertung'];
    expect(phrases(t, 'de')).toEqual(expect.arrayContaining(all));
    expect(noted(t, 'de')).toEqual(expect.arrayContaining(all));
  });
});

describe('negation — DE: always fires; note only where a cue governs the phrase', () => {
  it.each([
    ['nicht nur … sondern auch', 'Das Tool soll nicht nur Bewerber sortieren, sondern auch Termine planen.', 'bewerber sortieren'],
    ['darf nicht ohne menschliche Prüfung', 'Das Tool soll Bewerber sortieren und darf nicht ohne menschliche Prüfung eingesetzt werden.', 'bewerber sortieren'],
    ['nicht ohne (doppelte Verneinung)', 'Das Tool soll nicht ohne Freigabe Bewerber sortieren.', 'bewerber sortieren'],
    ['ohne trifft nur die nächste Phrase', 'Das System soll ohne Gesichtserkennung Bewerber sortieren.', 'bewerber sortieren'],
    ['Verneinung im vorigen Satz', 'Wir speichern keine Lebensläufe. Das Tool soll Bewerber sortieren.', 'bewerber sortieren'],
    ['Verneinung vor "aber"', 'Wir speichern keine Lebensläufe, aber das Tool soll Bewerber sortieren.', 'bewerber sortieren'],
    ['nachgestellt: nicht nur', 'Wir nutzen Gesichtserkennung nicht nur am Eingang.', 'gesichtserkennung'],
    ['Subjekt zwischen Verneinung und Phrase', 'Keines der Module nutzt Gesichtserkennung.', 'gesichtserkennung'],
    ['Nomen zwischen Verneinung und Phrase (bekannte Grenze)', 'Wir haben keinen Einsatz von Gesichtserkennung.', 'gesichtserkennung'],
    ['Präposition: verzichten nicht auf', 'Wir verzichten nicht auf Gesichtserkennung.', 'gesichtserkennung'],
    ['keine Einschränkungen', 'Es gibt keine Einschränkungen für die Gesichtserkennung.', 'gesichtserkennung'],
    ['nachgestellt: nicht für … eingesetzt, sondern', 'Gesichtserkennung wird nicht für Marketing eingesetzt, sondern für die Zutrittskontrolle.', 'gesichtserkennung'],
    ['nachgestellt: eingesetzt, sondern …', 'Gesichtserkennung wird nicht eingesetzt, sondern getestet.', 'gesichtserkennung'],
    ['nachgestellt: nicht optional', 'Gesichtserkennung ist nicht optional.', 'gesichtserkennung'],
    ['nachgestellt: nicht abschaltbar', 'Gesichtserkennung ist nicht abschaltbar.', 'gesichtserkennung'],
    ['nachgestellt: kann nicht deaktiviert werden', 'Gesichtserkennung kann nicht deaktiviert werden.', 'gesichtserkennung'],
    ['mögen … nicht ist keine Leugnung des Einsatzes', 'Die Mitarbeiter mögen Gesichtserkennung nicht.', 'gesichtserkennung'],
    ['doppelte Verneinung über Relativsatz', 'Es gibt keinen Fall, in dem das System nicht Bewerber sortieren würde.', 'bewerber sortieren'],
    ['doppelte Verneinung: kein … nicht', 'Kein Kunde wird nicht Gesichtserkennung nutzen.', 'gesichtserkennung'],
    ['dass-Satz nach verneintem Hauptsatz', 'Wir garantieren nicht, dass Gesichtserkennung nicht eingesetzt wird.', 'gesichtserkennung'],
    ['ohne + Phrase + Verb (offene Konstruktion)', 'Das System soll ohne Gesichtserkennung arbeiten.', 'gesichtserkennung'],
    ['weder … noch als Subjekt mit Prädikat', 'Weder Emotionserkennung noch Sozialbewertung werden eingesetzt.', 'emotionserkennung'],
    ['Subjekt + Prädikat', 'Keine Bonitätsprüfung wird ausgelassen.', 'bonitätsprüfung'],
    ['Partizip, aber Satz geht weiter', 'Keine Sozialbewertung durchgeführt zu haben ist unmöglich.', 'sozialbewertung'],
    ['allein nach der Phrase', 'Nicht die Bonitätsprüfung allein entscheidet über den Kredit.', 'bonitätsprüfung'],
    ['Aufzählung + bejahter Satz', 'Wir bieten keine Gesichtserkennung, Sozialbewertung oder Bonitätsprüfung wird stattdessen genutzt.', 'sozialbewertung'],
  ])('%s', (label, text, phrase) => {
    expect(phrases(text, 'de')).toContain(phrase);
    expect(noted(text, 'de').includes(phrase), `note expected: ${NOTED_OPEN.has(label)}`).toBe(NOTED_OPEN.has(label));
  });
});

describe('negation — plumbing', () => {
  it('both lexicons ship a well-formed _negation block', () => {
    expect(isNegationLexicon(EN_LEXICON._negation)).toBe(true);
    expect(isNegationLexicon(DE_LEXICON._negation)).toBe(true);
  });

  it('_negation is not discovered as a category group', () => {
    const r = extractFeatures('We do not use facial recognition.', { lang: 'en' });
    expect(Object.keys(r.byCategory)).not.toContain('_negation');
  });

  it('no _negation block → nothing marked (v0.3.1 behaviour)', () => {
    const s = findNegated('We do not rank job applicants.', undefined, [{ start: 3, end: 6 }]);
    expect(s.active).toBe(false);
    expect(s.negated.size).toBe(0);
  });

  it('a phrase with one denied and one stated occurrence fires and carries no note', () => {
    const r = extractFeatures('We do not use facial recognition. We use facial recognition.', { lang: 'en' });
    expect(r.hits.map((h) => h.phrase)).toContain('facial recognition');
    expect((r.negatedHits ?? []).map((h) => h.phrase)).not.toContain('facial recognition');
  });

  it('hits and byCategory are identical with and without the note (the note is additive)', () => {
    const t = 'A chatbot that does not use emotion recognition and does not do social scoring.';
    const r = extractFeatures(t, { lang: 'en' });
    for (const h of r.negatedHits ?? []) {
      expect(r.hits).toContainEqual({ group: h.group, category: h.category, phrase: h.phrase, source: h.source });
    }
  });

  it('noted hits carry group, category, source and cue — and no status (every entry is advisory)', () => {
    const r = extractFeatures('There is no social scoring.', { lang: 'en' });
    expect(r.negatedHits).toEqual([
      { group: 'article_5_prohibited', category: 'c_social_scoring', phrase: 'social scoring', source: expect.stringMatching(/^http/), cue: 'no' },
    ]);
  });

  it('negatedHitRef maps lexicon categories to AI Act references (EN + DE)', () => {
    expect(negatedHitRef('article_5_prohibited', 'f_emotion_in_workplace_education')).toBe('Art 5(1)(f)');
    expect(negatedHitRef('article_5_prohibited', 'f_emotion_in_workplace_education', 'de')).toBe('Art. 5 Abs. 1 Buchst. f');
    expect(negatedHitRef('annex_iii', '4_employment')).toBe('Annex III.4');
    expect(negatedHitRef('annex_iii', '4_employment', 'de')).toBe('Anhang III Nr. 4');
    expect(negatedHitRef('article_50_gpai', '5_public_interest_text')).toBe('Art 50(4)');
    expect(negatedHitRef('gpai_models', 'systemic_risk_markers')).toBe('Art 55');
  });

  it('noteRow places every lexicon group under a result line', () => {
    expect(noteRow('article_5_prohibited')).toBe('article_5');
    expect(noteRow('annex_iii')).toBe('annex_iii');
    expect(noteRow('scope_qualifiers')).toBe('annex_iii');
    expect(noteRow('article_50_gpai')).toBe('article_50');
    expect(noteRow('article_4_ai_literacy')).toBe('article_4');
    expect(noteRow('gpai_models')).toBe('gpai');
    expect(noteRow('something_new')).toBe('other');
  });

  it('no noted hits → output formats carry no note', async () => {
    const r = await classify('Our CV tool ranks job applicants.');
    expect(r.negated_hits).toEqual([]);
    expect(formatMarkdown(r, { locale: 'en', cite: false })).not.toContain('please check');
    expect(formatCliTable(r, { locale: 'en', cite: false, useColor: false })).not.toContain('please check');
    expect(formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false })).not.toContain('please check');
  });

  it('a note whose result line did not fire is still shown (--explain "other matched phrases")', async () => {
    // Annex III is suppressed by Article 5 here, so "emotion recognition" (Annex III.1) has no fired article.
    const r = await classify('A chatbot that does not use emotion recognition and does not do social scoring.', { lang: 'en' });
    const ex = formatExplain(r, { locale: 'en', format: 'markdown', withExcerpt: false });
    expect(ex).toContain('### ⚠️ Notes on other matched phrases');
    expect(ex).toContain(`${NOTE_EN}: "emotion recognition" (Annex III.1; negation: "not use")`);
  });

  it('a malformed block is rejected', () => {
    expect(isNegationLexicon({ cues: ['not'] })).toBe(false);
    expect(isNegationLexicon(null)).toBe(false);
    expect(isNegationLexicon([])).toBe(false);
  });

  it('is deterministic', () => {
    const t = 'A chatbot that does not use emotion recognition and does not do social scoring.';
    expect(extractFeatures(t)).toEqual(extractFeatures(t));
  });
});
