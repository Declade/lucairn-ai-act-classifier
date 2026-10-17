// Negation handling (after v0.3.1) — src/extract/negation.ts via extractFeatures().
// Governed-only: a hit is suppressed only when a negation cue directly governs
// the phrase; everything else fires. The over-correction guard (bug-hunter
// inputs + differential sweep) lives in negation-safety.spec.ts.
//
// Every negation case is paired with a positive control so a test cannot pass
// just because the phrase is missing from the lexicon.

import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classify } from '../../src/classify.js';
import { findNegated, isNegationLexicon } from '../../src/extract/negation.js';
import { formatMarkdown } from '../../src/format/markdown.js';
import { formatExplain } from '../../src/format/explain.js';
import { formatCliTable } from '../../src/format/cli-table.js';
import { negatedHitRef } from '../../src/util/negated-hits.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data');
const EN_LEXICON = JSON.parse(readFileSync(join(DATA, 'patterns.en.json'), 'utf8')) as Record<string, unknown>;
const DE_LEXICON = JSON.parse(readFileSync(join(DATA, 'patterns.de.json'), 'utf8')) as Record<string, unknown>;

function phrases(text: string, lang: 'en' | 'de'): string[] {
  return extractFeatures(text, { lang }).hits.map((h) => h.phrase);
}

type Case = { text: string; phrase: string };

/** [negated sentence, positive control] — the phrase must fire only in the control. */
function expectNegated(lang: 'en' | 'de', negated: Case, control: Case): void {
  expect(phrases(control.text, lang), `control should fire: ${control.text}`).toContain(control.phrase);
  expect(phrases(negated.text, lang), `negated should not fire: ${negated.text}`).not.toContain(negated.phrase);
}

describe('negation — the two reported sentences (classify end-to-end)', () => {
  it('EN "Our CV tool does NOT rank job applicants." is NOT high-risk', async () => {
    const r = await classify('Our CV tool does NOT rank job applicants.');
    expect(r.annex_iii.high_risk).toBe(false);
    expect(r.annex_iii.domains).toEqual([]);
    expect(r.annex_iv_required).toBe(false);
    expect(r.negated_hits).toContainEqual(
      expect.objectContaining({ phrase: 'rank job applicants', group: 'annex_iii', ref: 'Annex III.4', cue: 'not' }),
    );
    const control = await classify('Our CV tool ranks job applicants.');
    expect(control.annex_iii.high_risk).toBe(true);
    expect(control.annex_iii.domains.map((d) => d.annex_iii_number)).toContain(4);
  });

  it('EN "A chatbot that does not use emotion recognition and does not do social scoring." is NOT prohibited; Art 50 chatbot still applies', async () => {
    const r = await classify(
      'A chatbot that does not use emotion recognition and does not do social scoring.',
    );
    expect(r.article_5.prohibited).toBe(false);
    expect(r.annex_iii.high_risk).toBe(false);
    expect(r.article_50.applicable).toBe(true);
    expect(r.article_50.triggered_by.paragraph_1_interaction).toBe(true);
    expect(r.negated_hits).toContainEqual(
      expect.objectContaining({ phrase: 'social scoring', ref: 'Art 5(1)(c)', cue: 'not do' }),
    );
    expect(r.negated_hits).toContainEqual(expect.objectContaining({ phrase: 'emotion recognition', cue: 'not use' }));
    const control = await classify('A chatbot that uses emotion recognition and does social scoring.');
    expect(control.article_5.prohibited).toBe(true);
  });

  it('DE equivalents are not prohibited / not high-risk', async () => {
    const a = await classify('Unser CV-Tool sortiert keine Bewerber. Wir wollen nicht Bewerber sortieren.', { lang: 'de' });
    expect(a.annex_iii.high_risk).toBe(false);
    const b = await classify(
      'Ein Chatbot, der keine Emotionserkennung am Arbeitsplatz nutzt und keine Sozialbewertung betreibt.',
      { lang: 'de' },
    );
    expect(b.article_5.prohibited).toBe(false);
    expect(b.article_50.applicable).toBe(true);
    const control = await classify('Ein Chatbot, der Sozialbewertung betreibt.', { lang: 'de' });
    expect(control.article_5.prohibited).toBe(true);
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
    expectNegated('en', { text: negated, phrase }, { text: control, phrase });
  });

  it('neither … nor negates both items (closed: the list ends the clause)', () => {
    const p = phrases('We use neither social scoring nor emotion recognition.', 'en');
    expect(p).not.toContain('social scoring');
    expect(p).not.toContain('emotion recognition');
    const c = phrases('Social scoring and emotion recognition are part of it.', 'en');
    expect(c).toContain('social scoring');
    expect(c).toContain('emotion recognition');
  });

  it('without negates the next phrase only', () => {
    const p = phrases('We rank job applicants without facial recognition.', 'en');
    expect(p).toContain(rank);
    expect(p).not.toContain('facial recognition');
    expect(phrases('We rank job applicants with facial recognition.', 'en')).toContain('facial recognition');
  });

  it('a comma-separated list closed by "or" stays negated', () => {
    const p = phrases('We do not use emotion recognition, facial recognition or social scoring.', 'en');
    expect(p).not.toContain('emotion recognition');
    expect(p).not.toContain('facial recognition');
    expect(p).not.toContain('social scoring');
  });

  it.each([
    ['is not used', 'Facial recognition is not used.'],
    ["isn't used", "Facial recognition isn't used."],
    ['will never be performed', 'Facial recognition will never be performed.'],
    ['cannot be used', 'Facial recognition cannot be used.'],
    ['has not been deployed', 'Facial recognition has not been deployed.'],
  ])('trailing denial: "%s"', (_label, text) => {
    expectNegated(
      'en',
      { text, phrase: 'facial recognition' },
      { text: 'Facial recognition is used.', phrase: 'facial recognition' },
    );
  });
});

describe('negation — EN must still fire (no over-correction)', () => {
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
  ])('%s', (_label, text, phrase) => {
    expect(phrases(text, 'en')).toContain(phrase);
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
    expectNegated('de', { text: negated, phrase }, { text: control, phrase });
  });

  it('weder … noch negates both items (closed: the list ends the clause)', () => {
    const p = phrases('Wir nutzen weder Emotionserkennung noch Sozialbewertung.', 'de');
    expect(p).not.toContain('emotionserkennung');
    expect(p).not.toContain('sozialbewertung');
  });

  it('noch alone is not a negation', () => {
    expect(phrases('Gesichtserkennung wird noch eingesetzt.', 'de')).toContain('gesichtserkennung');
  });

  it('a comma list closed by "oder" stays negated', () => {
    const p = phrases('Wir nutzen keine Emotionserkennung, Gesichtserkennung oder Sozialbewertung.', 'de');
    expect(p).not.toContain('emotionserkennung');
    expect(p).not.toContain('gesichtserkennung');
    expect(p).not.toContain('sozialbewertung');
  });
});

describe('negation — DE must still fire (no over-correction)', () => {
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
  ])('%s', (_label, text, phrase) => {
    expect(phrases(text, 'de')).toContain(phrase);
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

  it('no _negation block → nothing negated (v0.3.1 behaviour)', () => {
    const s = findNegated('We do not rank job applicants.', undefined, [{ start: 3, end: 6 }]);
    expect(s.active).toBe(false);
    expect(s.suppressed.size).toBe(0);
  });

  it('a phrase with one denied and one stated occurrence fires and is not listed as negated', () => {
    const r = extractFeatures('We do not use facial recognition. We use facial recognition.', { lang: 'en' });
    expect(r.hits.map((h) => h.phrase)).toContain('facial recognition');
    expect((r.negatedHits ?? []).map((h) => h.phrase)).not.toContain('facial recognition');
  });

  it('negated hits carry group, category, source and cue', () => {
    const r = extractFeatures('There is no social scoring.', { lang: 'en' });
    expect(r.negatedHits).toContainEqual(
      expect.objectContaining({ group: 'article_5_prohibited', category: 'c_social_scoring', phrase: 'social scoring', cue: 'no' }),
    );
    expect(r.negatedHits?.every((h) => h.source.startsWith('http'))).toBe(true);
  });

  it('negatedHitRef maps lexicon categories to AI Act references (EN + DE)', () => {
    expect(negatedHitRef('article_5_prohibited', 'f_emotion_in_workplace_education')).toBe('Art 5(1)(f)');
    expect(negatedHitRef('article_5_prohibited', 'f_emotion_in_workplace_education', 'de')).toBe('Art. 5 Abs. 1 Buchst. f');
    expect(negatedHitRef('annex_iii', '4_employment')).toBe('Annex III.4');
    expect(negatedHitRef('annex_iii', '4_employment', 'de')).toBe('Anhang III Nr. 4');
    expect(negatedHitRef('article_50_gpai', '5_public_interest_text')).toBe('Art 50(4)');
    expect(negatedHitRef('gpai_models', 'systemic_risk_markers')).toBe('Art 55');
  });

  it('no negated hits → output formats unchanged (no safety-net block)', async () => {
    const r = await classify('Our CV tool ranks job applicants.');
    expect(r.negated_hits).toEqual([]);
    expect(formatMarkdown(r, { locale: 'en', cite: false })).not.toContain('read as denied');
  });

  it('negated hits are shown in markdown, explain and table output (EN + DE)', async () => {
    const en = await classify('Our CV tool does NOT rank job applicants.', { lang: 'en' });
    expect(formatMarkdown(en, { locale: 'en', cite: false })).toContain('Found but read as denied — check');
    expect(formatMarkdown(en, { locale: 'en', cite: false })).toContain('"rank job applicants" (Annex III.4) — negation: "not"');
    expect(formatExplain(en, { locale: 'en', format: 'markdown', withExcerpt: false })).toContain('Found but read as denied — check');
    expect(formatExplain(en, { locale: 'en', format: 'text', withExcerpt: false })).toContain('Found but read as denied — check');
    expect(JSON.parse(formatExplain(en, { locale: 'en', format: 'json', withExcerpt: false })).negated_hits).toHaveLength(1);
    expect(formatCliTable(en, { locale: 'en', cite: false, useColor: false })).toContain('Found but read as denied — check');
    const de = await classify('Es findet keine Sozialbewertung statt.', { lang: 'de' });
    expect(formatMarkdown(de, { locale: 'de', cite: false })).toContain('Gefunden, aber als verneint gelesen — bitte prüfen');
    expect(formatMarkdown(de, { locale: 'de', cite: false })).toContain('(Art. 5 Abs. 1 Buchst. c)');
    expect(formatExplain(de, { locale: 'de', format: 'markdown', withExcerpt: false })).toContain('Gefunden, aber als verneint gelesen — bitte prüfen');
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
