// Negation scoping (after v0.3.1) — src/extract/negation.ts via extractFeatures().
//
// Every negation case is paired with a positive control so a test cannot pass
// just because the phrase is missing from the lexicon.

import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../../src/extract/keyword.js';
import { classify } from '../../src/classify.js';
import { computeNegationScope, isNegationLexicon } from '../../src/extract/negation.js';
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
    ["isn't", "It isn't able to rank job applicants.", 'It is able to rank job applicants.', rank],
    ['neither (single)', 'Neither model will rank job applicants.', 'Either model will rank job applicants.', rank],
  ])('%s', (_label, negated, control, phrase) => {
    expectNegated('en', { text: negated, phrase }, { text: control, phrase });
  });

  it('neither … nor negates both items', () => {
    const p = phrases('Neither social scoring nor emotion recognition is part of it.', 'en');
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
    ["isn't used", "Facial recognition isn't used in this product."],
    ['will never be performed', 'Facial recognition will never be performed.'],
    ['cannot be used', 'Facial recognition cannot be used.'],
    ['is not part of', 'Facial recognition is not part of the product.'],
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
    ['keinen', 'Wir haben keinen Einsatz von Gesichtserkennung.', 'Wir haben einen Einsatz von Gesichtserkennung.', 'gesichtserkennung'],
    ['keiner', 'Bei keiner Anwendung wird Gesichtserkennung genutzt.', 'Bei jeder Anwendung wird Gesichtserkennung genutzt.', 'gesichtserkennung'],
    ['keinem', 'In keinem Fall Gesichtserkennung.', 'In jedem Fall Gesichtserkennung.', 'gesichtserkennung'],
    ['keines', 'Keines der Module nutzt Gesichtserkennung.', 'Eines der Module nutzt Gesichtserkennung.', 'gesichtserkennung'],
    ['ohne', 'Das System soll ohne Gesichtserkennung arbeiten.', 'Das System soll mit Gesichtserkennung arbeiten.', 'gesichtserkennung'],
    ['nachgestellt: wird nicht eingesetzt', 'Gesichtserkennung wird nicht eingesetzt.', 'Gesichtserkennung wird eingesetzt.', 'gesichtserkennung'],
    ['nachgestellt: nutzen … nicht', 'Wir nutzen Emotionserkennung nicht.', 'Wir nutzen Emotionserkennung.', 'emotionserkennung'],
  ])('%s', (_label, negated, control, phrase) => {
    expectNegated('de', { text: negated, phrase }, { text: control, phrase });
  });

  it('weder … noch negates both items', () => {
    const p = phrases('Weder Emotionserkennung noch Sozialbewertung werden eingesetzt.', 'de');
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
    const s = computeNegationScope('We do not rank job applicants.', undefined);
    expect(s.active).toBe(false);
    expect(s.negated.every((x) => !x)).toBe(true);
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
