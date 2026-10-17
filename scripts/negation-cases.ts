// Shared inputs for the negation safety checks (after v0.3.1).
//
// Used by scripts/negation-sweep.ts (the differential report against a
// checkout of the pre-negation engine) and by test/extract/negation-safety.spec.ts.
//
//   - MUST_STILL_FIRE: every input from the 2026-10-17 bug-hunter report on
//     PR #24 (B1 avoidance / non-denial, B2 without, B3 trailing non-denials,
//     I1 double negation, I2 limiters), plus DE counterparts. The pre-negation
//     engine fires on all of them; the verdict must not drop.
//   - GOVERNED_NEGATION_SET: sentences where the cue really governs the
//     phrase. 0 prohibited / high-risk triggers allowed (PRD Locked
//     criterion 1), and every one must report the phrase in negated_hits.
//   - Sweep: five shape families (buildSweep). (1) "<unrelated negated
//     clause><joiner><plainly stated trigger>"; (2) a governed phrase followed
//     by an open continuation (only / alone / by X / during X / but /
//     sondern …); (3) a phrase in subject position with a following predicate;
//     (4) a negated list followed by an affirmative clause; (5) the review-seat
//     inputs. None of them denies the practice, so the verdict must equal the
//     pre-negation engine's.

export type Lang = 'en' | 'de';

export interface Case {
  id: string;
  lang: Lang;
  text: string;
}

export const MUST_STILL_FIRE: ReadonlyArray<Case> = [
  // B1 — avoidance verbs, non-denials, unrelated negation (EN).
  { id: 'B1-en-01', lang: 'en', text: 'Employees cannot opt out of emotion recognition in the workplace.' },
  { id: 'B1-en-02', lang: 'en', text: "Employees can't refuse emotion recognition in the workplace." },
  { id: 'B1-en-03', lang: 'en', text: 'Workers have no way to avoid emotion recognition in the workplace.' },
  { id: 'B1-en-04', lang: 'en', text: 'No consent is required for emotion recognition in the workplace.' },
  { id: 'B1-en-05', lang: 'en', text: 'We impose no limits on emotion recognition in the workplace.' },
  { id: 'B1-en-06', lang: 'en', text: 'Users are not informed that we use emotion recognition in the workplace.' },
  { id: 'B1-en-07', lang: 'en', text: 'Features including but not limited to emotion recognition in the workplace.' },
  { id: 'B1-en-08', lang: 'en', text: 'No human reviews how the system ranks job applicants.' },
  { id: 'B1-en-09', lang: 'en', text: 'No human checks the system that evaluates creditworthiness of natural persons.' },
  { id: 'B1-en-10', lang: 'en', text: 'There is no human in the loop when the system evaluates creditworthiness.' },
  { id: 'B1-en-11', lang: 'en', text: 'Applicants cannot contest how the tool ranks job applicants.' },
  { id: 'B1-en-12', lang: 'en', text: 'If no recruiter is available the system ranks job applicants automatically.' },
  { id: 'B1-en-13', lang: 'en', text: 'Our HR tool which no recruiter supervises ranks job applicants.' },
  { id: 'B1-en-14', lang: 'en', text: 'No more manual screening - the AI ranks job applicants.' },
  { id: 'B1-en-15', lang: 'en', text: 'No more manual screening — the AI ranks job applicants.' },
  { id: 'B1-en-16', lang: 'en', text: 'No cloud • ranks job applicants • evaluates creditworthiness' },
  { id: 'B1-en-17', lang: 'en', text: 'Use cases include but are not limited to credit scoring for consumers.' },
  { id: 'B1-en-18', lang: 'en', text: 'We do not store data, the system ranks job applicants or employees.' },
  // B1 (DE).
  { id: 'B1-de-01', lang: 'de', text: 'Kein Mitarbeiter kann der Emotionserkennung am Arbeitsplatz widersprechen.' },
  { id: 'B1-de-02', lang: 'de', text: 'Es gibt keine Einschränkungen für die Emotionserkennung am Arbeitsplatz.' },
  { id: 'B1-de-03', lang: 'de', text: 'Wir verzichten nicht auf Emotionserkennung am Arbeitsplatz.' },
  { id: 'B1-de-04', lang: 'de', text: 'Kein Mensch kontrolliert die Bonitätsprüfung.' },
  { id: 'B1-de-05', lang: 'de', text: 'Mitarbeiter können die Emotionserkennung am Arbeitsplatz nicht ablehnen.' },
  { id: 'B1-de-06', lang: 'de', text: 'Es ist keine Einwilligung für die Emotionserkennung am Arbeitsplatz nötig.' },
  { id: 'B1-de-07', lang: 'de', text: 'Wir speichern keine Daten, das System erstellt ein Bewerber-Ranking.' },
  { id: 'B1-de-08', lang: 'de', text: 'Kein Personaler prüft, wie das System die Bewerberauswahl trifft.' },
  // B2 — without / ohne only negates the phrase right after it.
  { id: 'B2-en-01', lang: 'en', text: 'Without human review the tool ranks job applicants.' },
  { id: 'B2-en-02', lang: 'en', text: 'Without human review the tool performs credit scoring for consumers.' },
  { id: 'B2-en-03', lang: 'en', text: 'Without human oversight the system evaluates creditworthiness.' },
  { id: 'B2-en-04', lang: 'en', text: 'The system operates without oversight emotion recognition in the workplace.' },
  { id: 'B2-de-01', lang: 'de', text: 'Ohne menschliche Prüfung erstellt das Tool ein Bewerber-Ranking.' },
  { id: 'B2-de-02', lang: 'de', text: 'Ohne menschliche Aufsicht übernimmt das System die Bonitätsprüfung.' },
  // B3 — trailing non-denials.
  { id: 'B3-de-01', lang: 'de', text: 'Gesichtserkennung wird nicht für Marketing eingesetzt, sondern für die Zutrittskontrolle.' },
  { id: 'B3-de-02', lang: 'de', text: 'Gesichtserkennung ist nicht optional.' },
  { id: 'B3-de-03', lang: 'de', text: 'Emotionserkennung am Arbeitsplatz kann nicht deaktiviert werden.' },
  { id: 'B3-de-04', lang: 'de', text: 'Emotionserkennung am Arbeitsplatz ist nicht abschaltbar.' },
  { id: 'B3-de-05', lang: 'de', text: 'Sozialbewertung wird nicht manuell durchgeführt; die KI übernimmt das.' },
  { id: 'B3-en-01', lang: 'en', text: 'Emotion recognition in the workplace is not used to discipline staff, only to measure engagement.' },
  { id: 'B3-en-02', lang: 'en', text: 'Social scoring is not possible to switch off.' },
  { id: 'B3-en-03', lang: 'en', text: 'Social scoring is never performed manually; the AI does it.' },
  { id: 'B3-en-04', lang: 'en', text: 'Social scoring is not offered to the public sector yet.' },
  { id: 'B3-en-05', lang: 'en', text: 'Facial recognition is not used for marketing purposes.' },
  { id: 'B3-en-06', lang: 'en', text: 'Facial recognition is not optional.' },
  { id: 'B3-en-07', lang: 'en', text: 'Emotion recognition in the workplace cannot be disabled.' },
  // I1 — double negation.
  { id: 'I1-en-01', lang: 'en', text: 'There is no case in which the system does not rank job applicants.' },
  { id: 'I1-de-01', lang: 'de', text: 'Es gibt keinen Fall, in dem das System nicht Bewerber sortieren würde.' },
  // I2 — limiters.
  { id: 'I2-en-01', lang: 'en', text: 'The system does not exclusively evaluate creditworthiness.' },
  { id: 'I2-en-02', lang: 'en', text: 'The tool is not simply a CV filter that ranks job applicants.' },
  { id: 'I2-de-01', lang: 'de', text: 'Das System übernimmt nicht nur die Bonitätsprüfung.' },
  { id: 'I2-de-02', lang: 'de', text: 'Das Tool soll nicht ausschließlich Bewerber sortieren.' },
  // R3 — review seat (gpt-6.1-sol) on 768307fb: open constructions after a
  // governed phrase (restriction, subject + predicate, list + affirmative clause).
  { id: 'R3-en-01', lang: 'en', text: 'We do not rank job applicants only by experience; age is also scored.' },
  { id: 'R3-en-02', lang: 'en', text: 'We do not perform emotion recognition in the workplace only during interviews; it runs continuously.' },
  { id: 'R3-de-03', lang: 'de', text: 'Nicht die Bonitätsprüfung allein entscheidet über den Kredit.' },
  { id: 'R3-en-04', lang: 'en', text: 'No credit scoring request is left unprocessed.' },
  { id: 'R3-de-05', lang: 'de', text: 'Keine Bonitätsprüfung wird ausgelassen.' },
  { id: 'R3-en-06', lang: 'en', text: 'Not using social scoring is impossible.' },
  { id: 'R3-en-07', lang: 'en', text: 'We do not offer facial recognition, social scoring or credit scoring is used instead.' },
  // R3 — counterparts in the other language.
  { id: 'R3-de-01', lang: 'de', text: 'Wir nutzen keine Bewerberauswahl allein nach Erfahrung; das Alter wird auch bewertet.' },
  { id: 'R3-de-02', lang: 'de', text: 'Wir nutzen keine Emotionserkennung am Arbeitsplatz nur während der Interviews; sie läuft dauerhaft.' },
  { id: 'R3-en-03', lang: 'en', text: 'Not credit scoring alone decides on the loan.' },
  { id: 'R3-de-04', lang: 'de', text: 'Keine Bonitätsprüfung bleibt unbearbeitet.' },
  { id: 'R3-en-05', lang: 'en', text: 'No credit scoring is skipped.' },
  { id: 'R3-de-06', lang: 'de', text: 'Keine Sozialbewertung zu nutzen ist unmöglich.' },
  { id: 'R3-de-07', lang: 'de', text: 'Wir bieten keine Gesichtserkennung, Sozialbewertung oder Bonitätsprüfung wird stattdessen genutzt.' },
];

/** Cue governs the phrase → no prohibited / high-risk trigger, phrase in negated_hits. */
export const GOVERNED_NEGATION_SET: ReadonlyArray<Case & { phrase: string }> = [
  { id: 'N-en-01', lang: 'en', text: 'Our CV tool does NOT rank job applicants.', phrase: 'rank job applicants' },
  { id: 'N-en-02', lang: 'en', text: 'A chatbot that does not use emotion recognition and does not do social scoring.', phrase: 'social scoring' },
  { id: 'N-en-03', lang: 'en', text: 'We do not use emotion recognition in the workplace.', phrase: 'emotion recognition in the workplace' },
  { id: 'N-en-04', lang: 'en', text: 'The platform never performs social scoring.', phrase: 'social scoring' },
  { id: 'N-en-05', lang: 'en', text: 'There is no social scoring.', phrase: 'social scoring' },
  { id: 'N-en-06', lang: 'en', text: "The app doesn't do credit scoring.", phrase: 'credit scoring' },
  { id: 'N-en-07', lang: 'en', text: 'Facial recognition is not used.', phrase: 'facial recognition' },
  { id: 'N-en-08', lang: 'en', text: 'Emotion recognition in the workplace will never be performed.', phrase: 'emotion recognition in the workplace' },
  { id: 'N-en-09', lang: 'en', text: 'We do not use emotion recognition, facial recognition or social scoring.', phrase: 'facial recognition' },
  { id: 'N-en-10', lang: 'en', text: 'We use neither social scoring nor emotion recognition.', phrase: 'emotion recognition' },
  { id: 'N-de-01', lang: 'de', text: 'Unser System nutzt keine Emotionserkennung am Arbeitsplatz.', phrase: 'emotionserkennung am arbeitsplatz' },
  { id: 'N-de-02', lang: 'de', text: 'Es findet keine Sozialbewertung statt.', phrase: 'sozialbewertung' },
  { id: 'N-de-03', lang: 'de', text: 'Das Tool soll nicht Bewerber sortieren.', phrase: 'bewerber sortieren' },
  { id: 'N-de-04', lang: 'de', text: 'Gesichtserkennung wird nicht eingesetzt.', phrase: 'gesichtserkennung' },
  { id: 'N-de-05', lang: 'de', text: 'Wir setzen niemals Gesichtserkennung ein.', phrase: 'gesichtserkennung' },
  { id: 'N-de-06', lang: 'de', text: 'Wir nutzen Emotionserkennung nicht.', phrase: 'emotionserkennung' },
  { id: 'N-de-07', lang: 'de', text: 'Es findet kein Bewerber-Ranking statt.', phrase: 'bewerber-ranking' },
  { id: 'N-de-08', lang: 'de', text: 'Wir nutzen weder Emotionserkennung noch Sozialbewertung.', phrase: 'sozialbewertung' },
];

// ---------------------------------------------------------------------------
// Differential sweep construction
// ---------------------------------------------------------------------------

/** Unrelated negated clauses (no lexicon phrase in them). */
export const SWEEP_NEGATED_CLAUSES: Record<Lang, ReadonlyArray<string>> = {
  en: ['We do not store data', 'No cloud service is involved', "Users can't export reports"],
  de: ['Wir speichern keine Daten', 'Es gibt keine Cloud'],
};

/** Joiners placed between the negated clause and the trigger. */
export const SWEEP_JOINERS: Record<Lang, ReadonlyArray<{ id: string; text: string }>> = {
  en: [
    { id: 'space', text: ' ' },
    { id: 'comma', text: ', ' },
    { id: 'dash', text: ' - ' },
    { id: 'em-dash', text: ' — ' },
    { id: 'slash', text: ' / ' },
    { id: 'bracket', text: ' (' },
    { id: 'bullet', text: ' • ' },
    { id: 'when', text: ' when ' },
    { id: 'if', text: ' if ' },
    { id: 'that', text: ' that ' },
    { id: 'because', text: ' because ' },
    { id: 'and', text: ' and ' },
    { id: 'but', text: ' but ' },
    { id: 'or', text: ' or ' },
    { id: 'semicolon', text: '; ' },
    { id: 'colon', text: ': ' },
    { id: 'while', text: ' while ' },
  ],
  de: [
    { id: 'space', text: ' ' },
    { id: 'comma', text: ', ' },
    { id: 'dash', text: ' - ' },
    { id: 'em-dash', text: ' — ' },
    { id: 'slash', text: ' / ' },
    { id: 'bracket', text: ' (' },
    { id: 'bullet', text: ' • ' },
    { id: 'weil', text: ', weil ' },
    { id: 'wenn', text: ', wenn ' },
    { id: 'damit', text: ', damit ' },
    { id: 'dass', text: ', dass ' },
    { id: 'und', text: ' und ' },
    { id: 'aber', text: ', aber ' },
    { id: 'oder', text: ' oder ' },
  ],
};

/** Plainly stated triggers across Article 5 and Annex III. */
export const SWEEP_TRIGGERS: Record<Lang, ReadonlyArray<string>> = {
  en: [
    'the system ranks job applicants',
    'the tool performs emotion recognition in the workplace',
    'the platform does social scoring',
    'the system evaluates creditworthiness of natural persons',
    'the tool performs credit scoring for consumers',
    'the app uses facial recognition at the entrance',
    'the system uses a subliminal technique',
    'the system is designed to exploit children',
    'the software does predictive policing',
    'the tool will scrape facial images from the internet',
    'the system uses live facial recognition in public spaces',
    'the system performs biometric categorisation to infer race',
    'the model handles student admissions',
    'the system does automated grading of exams',
    'the tool performs cv screening',
    'the system supports hiring decisions',
    'the system assesses insurance pricing',
    'the model estimates recidivism risk',
    'the system processes asylum applications',
    'the tool drafts each judicial decision',
    'the software controls the power grid',
    'the system ranks citizens by behaviour',
  ],
  de: [
    'das System erstellt ein Bewerber-Ranking',
    'das Tool nutzt Emotionserkennung am Arbeitsplatz',
    'die Plattform betreibt Sozialbewertung',
    'das System übernimmt die Bonitätsprüfung',
    'das System prüft die Kreditwürdigkeit',
    'die App nutzt Gesichtserkennung am Eingang',
    'das System nutzt unterschwellige Techniken',
    'die Software betreibt vorhersagende Polizeiarbeit',
    'das Tool betreibt Gesichtsbilder Scraping',
    'das System nutzt Echtzeit-Gesichtserkennung',
    'das System übernimmt die Prüfungsbewertung',
    'das Tool übernimmt das Lebenslauf-Screening',
    'das System trifft die Personalauswahl',
    'das System berechnet die Versicherungstarifierung',
    'das System schätzt das Rückfallrisiko',
    'das System bearbeitet Asylanträge',
    'das System steuert das Stromnetz',
    'das System trifft die Bewerberauswahl',
    'das System dient der Wahlbeeinflussung',
    'das System kann politische Meinung ableiten',
  ],
};

export type SweepFamily =
  | 'unrelated-negation'
  | 'post-phrase-continuation'
  | 'subject-position'
  | 'list-plus-affirmative'
  | 'reviewer-inputs';

export const SWEEP_FAMILIES: ReadonlyArray<SweepFamily> = [
  'unrelated-negation',
  'post-phrase-continuation',
  'subject-position',
  'list-plus-affirmative',
  'reviewer-inputs',
];

export interface SweepCase extends Case {
  family: SweepFamily;
  /** unrelated-negation only: the trigger sentence (its "alone" baseline must trigger on the reference) */
  trigger?: string;
}

/** EN verb + object predicates a cue can govern ("We do not <P>."). */
const EN_PREDICATES: ReadonlyArray<string> = [
  'rank job applicants',
  'use emotion recognition in the workplace',
  'do social scoring',
  'perform credit scoring',
  'use facial recognition',
  'evaluate creditworthiness',
  'use live facial recognition',
  'do predictive policing',
  'perform cv screening',
  'use biometric categorisation to infer race',
  'use a subliminal technique',
  'do automated grading',
];

/** Open continuations after a governed EN phrase (restriction, contrast, purpose, time). */
const EN_CONTINUATIONS: ReadonlyArray<string> = [
  ' only by experience; age is also scored',
  ' only during interviews; it runs continuously',
  ' alone',
  ' solely for testing',
  ' just in the pilot',
  ' merely on request',
  ' by default',
  ' during interviews',
  ' for most users',
  ' but we do it manually',
  ', but the vendor does',
  ' rather than humans',
  ' except at night',
  ' at the moment, the vendor does it for us',
];

/** EN nouns for subject-position and list shapes. */
const EN_NOUNS: ReadonlyArray<string> = [
  'credit scoring',
  'social scoring',
  'emotion recognition in the workplace',
  'facial recognition',
  'cv screening',
  'predictive policing',
  'live facial recognition',
  'biometric categorisation',
];

const EN_SUBJECT_TEMPLATES: ReadonlyArray<(n: string) => string> = [
  (n) => `No ${n} request is left unprocessed.`,
  (n) => `No ${n} step is ever skipped.`,
  (n) => `Not using ${n} is impossible.`,
  (n) => `No ${n} is optional here.`,
  (n) => `No ${n} decision goes unreviewed.`,
  (n) => `Not ${n} alone decides the outcome.`,
];

const EN_LIST_TEMPLATES: ReadonlyArray<(a: string, b: string, c: string) => string> = [
  (a, b, c) => `We do not offer ${a}, ${b} or ${c} is used instead.`,
  (a, b) => `We do not use ${a} or ${b} is used instead.`,
  (a, b) => `We do not use ${a} and ${b} runs in production.`,
  (a, b) => `We do not use ${a}, ${b} is active.`,
];

/** DE nouns with the matching form of kein. */
const DE_ITEMS: ReadonlyArray<{ kein: string; noun: string }> = [
  { kein: 'keine', noun: 'Emotionserkennung am Arbeitsplatz' },
  { kein: 'keine', noun: 'Sozialbewertung' },
  { kein: 'keine', noun: 'Bonitätsprüfung' },
  { kein: 'keine', noun: 'Gesichtserkennung' },
  { kein: 'keine', noun: 'Echtzeit-Gesichtserkennung' },
  { kein: 'keine', noun: 'vorhersagende Polizeiarbeit' },
  { kein: 'kein', noun: 'Lebenslauf-Screening' },
  { kein: 'keine', noun: 'Bewerberauswahl' },
  { kein: 'keine', noun: 'Prüfungsbewertung' },
  { kein: 'kein', noun: 'Bewerber-Ranking' },
];

const DE_CONTINUATIONS: ReadonlyArray<string> = [
  ' allein',
  ' nur im Test',
  ' nur während der Interviews; sie läuft dauerhaft',
  ' lediglich als Pilot',
  ' bloß auf Anfrage',
  ' während der Bewerbung',
  ' für die meisten Nutzer',
  ', sondern der Anbieter',
  ', aber der Anbieter schon',
  ' außer nachts',
  ' ausschließlich für Bestandskunden',
  ' bei Neukunden',
];

const DE_SUBJECT_TEMPLATES: ReadonlyArray<(i: { kein: string; noun: string }) => string> = [
  (i) => `${cap(i.kein)} ${i.noun} wird ausgelassen.`,
  (i) => `${cap(i.kein)} ${i.noun} ist optional.`,
  (i) => `Nicht die ${i.noun} entscheidet, sondern der Mensch.`,
  (i) => `${cap(i.kein)} ${i.noun} bleibt unbearbeitet.`,
  (i) => `Nicht die ${i.noun} allein entscheidet über den Kredit.`,
];

const DE_LIST_TEMPLATES: ReadonlyArray<(a: { kein: string; noun: string }, b: { noun: string }, c: { noun: string }) => string> = [
  (a, b, c) => `Wir bieten ${a.kein} ${a.noun}, ${b.noun} oder ${c.noun} wird stattdessen genutzt.`,
  (a, b) => `Wir nutzen ${a.kein} ${a.noun} und ${b.noun} läuft produktiv.`,
  (a, b) => `Wir nutzen ${a.kein} ${a.noun}, ${b.noun} ist aktiv.`,
  (a, b) => `Wir nutzen ${a.kein} ${a.noun} oder ${b.noun} wird genutzt.`,
];

function cap(x: string): string {
  return `${x.charAt(0).toUpperCase()}${x.slice(1)}`;
}

/** Family 1: every "<negated clause><joiner><trigger>" combination for one language. */
function buildUnrelated(lang: Lang): SweepCase[] {
  const out: SweepCase[] = [];
  for (const clause of SWEEP_NEGATED_CLAUSES[lang]) {
    for (const j of SWEEP_JOINERS[lang]) {
      for (const trigger of SWEEP_TRIGGERS[lang]) {
        const close = j.id === 'bracket' ? ')' : '';
        out.push({
          id: `${lang}|unrelated|${clause}|${j.id}|${trigger}`,
          lang,
          family: 'unrelated-negation',
          trigger,
          text: `${clause}${j.text}${trigger}${close}.`,
        });
      }
    }
  }
  return out;
}

/** Every generated sweep sentence for one language, all five families. */
export function buildSweep(lang: Lang): SweepCase[] {
  const out: SweepCase[] = buildUnrelated(lang);
  const push = (family: SweepFamily, text: string): void => {
    out.push({ id: `${lang}|${family}|${text}`, lang, family, text });
  };
  if (lang === 'en') {
    for (const p of EN_PREDICATES) for (const c of EN_CONTINUATIONS) push('post-phrase-continuation', `We do not ${p}${c}.`);
    for (const n of EN_NOUNS) for (const t of EN_SUBJECT_TEMPLATES) push('subject-position', t(n));
    EN_NOUNS.forEach((a, i) => {
      const b = EN_NOUNS[(i + 1) % EN_NOUNS.length] as string;
      const c = EN_NOUNS[(i + 2) % EN_NOUNS.length] as string;
      for (const t of EN_LIST_TEMPLATES) push('list-plus-affirmative', t(a, b, c));
    });
  } else {
    for (const item of DE_ITEMS) for (const c of DE_CONTINUATIONS) push('post-phrase-continuation', `Wir nutzen ${item.kein} ${item.noun}${c}.`);
    for (const item of DE_ITEMS) for (const t of DE_SUBJECT_TEMPLATES) push('subject-position', t(item));
    DE_ITEMS.forEach((a, i) => {
      const b = DE_ITEMS[(i + 1) % DE_ITEMS.length] as { noun: string };
      const c = DE_ITEMS[(i + 2) % DE_ITEMS.length] as { noun: string };
      for (const t of DE_LIST_TEMPLATES) push('list-plus-affirmative', t(a, b, c));
    });
  }
  for (const c of MUST_STILL_FIRE) if (c.lang === lang && c.id.startsWith('R3-')) push('reviewer-inputs', c.text);
  return out;
}

/** Verdict level used for "lower than": 3 prohibited · 2 high-risk · 1 Art 50 · 0 none. */
export interface VerdictLike {
  article_5: { prohibited: boolean; hits: ReadonlyArray<{ letter: string }> };
  annex_iii: { high_risk: boolean; domains: ReadonlyArray<{ annex_iii_number: number }> };
  article_50: { applicable: boolean };
}

export function verdictLevel(r: VerdictLike): number {
  if (r.article_5.prohibited) return 3;
  if (r.annex_iii.high_risk) return 2;
  if (r.article_50.applicable) return 1;
  return 0;
}

export function verdictLabel(r: VerdictLike): string {
  const letters = r.article_5.hits.map((h) => h.letter).join('');
  const domains = r.annex_iii.domains.map((d) => d.annex_iii_number).join(',');
  const lvl = verdictLevel(r);
  const name = ['none', 'art50', 'high-risk', 'prohibited'][lvl] as string;
  return `${name}${letters ? ` 5(1)(${letters})` : ''}${domains ? ` III[${domains}]` : ''}`;
}

/** Triggers the reference fired that the candidate lost (Art 5 letters + Annex III domains). */
export function droppedTriggers(reference: VerdictLike, candidate: VerdictLike): string[] {
  const out: string[] = [];
  const candLetters = new Set(candidate.article_5.hits.map((h) => h.letter));
  for (const h of reference.article_5.hits) if (!candLetters.has(h.letter)) out.push(`5(1)(${h.letter})`);
  const candDomains = new Set(candidate.annex_iii.domains.map((d) => d.annex_iii_number));
  for (const d of reference.annex_iii.domains) if (!candDomains.has(d.annex_iii_number)) out.push(`III.${d.annex_iii_number}`);
  return out;
}
