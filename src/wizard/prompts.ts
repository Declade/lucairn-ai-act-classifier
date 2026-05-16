// Wizard mode — EN+DE i18n prompt strings.
//
// 21 questions total across 3 steps:
//   Step 1: 8 Article 5(1) prohibition Y/N prompts (letters a-h)
//   Step 2: 8 Annex III high-risk paragraph Y/N prompts (¶1-8) with optional sub-letter follow-ups
//   Step 3: 5 Article 50 transparency Y/N prompts (paragraphs 1, 2, 3, 4-sub1 deepfake, 4-sub2 public-interest)
//
// Each prompt carries a regulator-verbatim short description from EUR-Lex /
// EU AI Office Service Desk. The user reads the description and answers Y/N.
//
// Pure-data module: no I/O, no runtime side effects.

import type { Article5Letter, AnnexIIIParagraph, Article50Path } from './answers.js';

export interface PromptItem<T> {
  /** Identifier returned when user answers Y. */
  key: T;
  /** Short label shown in the prompt (≤ 50 chars). */
  label: string;
  /** Regulator-verbatim short description shown to the user. */
  description: string;
}

export interface WizardPrompts {
  step_intro: {
    step1: string;
    step2: string;
    step3: string;
    submit: string;
  };
  yes_no: { yes: string; no: string; yes_short: string; no_short: string };
  article_5: Array<PromptItem<Article5Letter>>;
  annex_iii: Array<PromptItem<AnnexIIIParagraph>>;
  annex_iii_sub_letters: Record<AnnexIIIParagraph, Array<PromptItem<string>>>;
  article_50: Array<PromptItem<Article50Path>>;
  result_intro: string;
  banner: string;
}

export const PROMPTS_EN: WizardPrompts = {
  step_intro: {
    step1:
      'Step 1 of 3 — Article 5(1) prohibited practices. Answer Y/N for each.',
    step2:
      'Step 2 of 3 — Article 6 + Annex III high-risk classification. Answer Y/N for each. If you answer Y, you may further narrow to specific sub-letters (a/b/c/d/...).',
    step3:
      'Step 3 of 3 — Article 50 transparency obligations. Answer Y/N for each.',
    submit:
      'All answers collected. Building classification…',
  },
  yes_no: { yes: 'yes', no: 'no', yes_short: 'y', no_short: 'n' },
  article_5: [
    {
      key: 'a',
      label: '(a) Subliminal or deceptive techniques',
      description:
        'AI system that places subliminal techniques beyond a person\'s consciousness, or deliberately manipulative/deceptive techniques, with the objective or effect of materially distorting behaviour and causing significant harm.',
    },
    {
      key: 'b',
      label: '(b) Vulnerability exploitation',
      description:
        'AI system that exploits vulnerabilities of natural persons (age, disability, social/economic situation) to materially distort behaviour and cause significant harm.',
    },
    {
      key: 'c',
      label: '(c) Social scoring',
      description:
        'AI system for social scoring of natural persons leading to detrimental treatment in social contexts unrelated to the data\'s original evaluation purpose.',
    },
    {
      key: 'd',
      label: '(d) Predictive policing (solely on profiling)',
      description:
        'AI system that predicts criminal offences by natural persons based solely on profiling or assessment of personality traits/characteristics (vs. Annex III ¶6(d) which is broader and high-risk, not prohibited).',
    },
    {
      key: 'e',
      label: '(e) Untargeted facial scraping',
      description:
        'AI system that creates or expands facial recognition databases through untargeted scraping of facial images from the internet or CCTV.',
    },
    {
      key: 'f',
      label: '(f) Emotion recognition in workplace / education',
      description:
        'AI system that infers emotions of natural persons in workplace or educational institutions (with medical/safety exceptions; carve-out preserved if your description includes "medical" or "safety reasons").',
    },
    {
      key: 'g',
      label: '(g) Biometric categorisation by sensitive attributes',
      description:
        'AI system that performs biometric categorisation of natural persons to deduce/infer race, political opinions, trade-union membership, religious/philosophical beliefs, sex life, or sexual orientation.',
    },
    {
      key: 'h',
      label: '(h) Real-time remote biometric ID in public spaces (LE)',
      description:
        'AI system for real-time remote biometric identification in publicly accessible spaces for law enforcement (narrow statutory exceptions only).',
    },
  ],
  annex_iii: [
    {
      key: 1,
      label: '¶1 Biometrics',
      description:
        'AI systems for remote biometric identification, biometric categorisation by sensitive/protected attributes (excluding identity verification), or emotion recognition.',
    },
    {
      key: 2,
      label: '¶2 Critical infrastructure',
      description:
        'AI systems used as safety components in critical digital infrastructure, road traffic, or supply of water/gas/heating/electricity.',
    },
    {
      key: 3,
      label: '¶3 Education / vocational training',
      description:
        'AI systems determining access to educational institutions, evaluating learning outcomes, assessing appropriate level of education, or monitoring prohibited behaviour during exams.',
    },
    {
      key: 4,
      label: '¶4 Employment / workers\' management',
      description:
        'AI systems for recruitment / selection (CV screening, applicant ranking), workplace decisions (promotion, termination, task allocation), or performance monitoring of existing employees.',
    },
    {
      key: 5,
      label: '¶5 Essential public/private services',
      description:
        'AI systems for public assistance eligibility, creditworthiness/credit scoring, life/health insurance risk assessment/pricing, or emergency dispatch.',
    },
    {
      key: 6,
      label: '¶6 Law enforcement',
      description:
        'AI systems for risk assessment of natural persons becoming victims, polygraphs, evidence reliability, profiling, or deep crime-data analysis (in law-enforcement context).',
    },
    {
      key: 7,
      label: '¶7 Migration / asylum / border',
      description:
        'AI systems for migration/asylum/border-control risk assessment, polygraphs, examining applications, or detection/identification at borders.',
    },
    {
      key: 8,
      label: '¶8 Justice / democracy',
      description:
        'AI systems used by judicial authorities for legal research/interpretation/application, or AI systems intended to influence elections or voting behaviour.',
    },
  ],
  annex_iii_sub_letters: {
    1: [
      { key: 'a', label: '(a) remote biometric identification', description: 'Remote biometric identification systems.' },
      { key: 'b', label: '(b) biometric categorisation', description: 'Biometric categorisation by sensitive/protected attributes.' },
      { key: 'c', label: '(c) emotion recognition', description: 'Emotion recognition (in non-prohibited contexts).' },
    ],
    2: [
      { key: 'a', label: '(a) digital infrastructure', description: 'Safety components of critical digital infrastructure.' },
      { key: 'b', label: '(b) water / gas / heating / electricity', description: 'Supply of water, gas, heating, electricity.' },
      { key: 'c', label: '(c) road traffic', description: 'Safety components of road traffic.' },
    ],
    3: [
      { key: 'a', label: '(a) access to education', description: 'Determining access / admission / assignment to educational institutions.' },
      { key: 'b', label: '(b) learning outcomes', description: 'Evaluating learning outcomes.' },
      { key: 'c', label: '(c) appropriate level of education', description: 'Assessing appropriate level of education a person will receive.' },
      { key: 'd', label: '(d) exam monitoring', description: 'Monitoring/detecting prohibited behaviour during exams.' },
    ],
    4: [
      { key: 'a', label: '(a) recruitment / selection', description: 'Recruitment / selection of natural persons (job ad targeting, CV/application screening, candidate evaluation).' },
      { key: 'b', label: '(b) workplace decisions', description: 'Decisions affecting terms of work (promotion, termination, task allocation, performance monitoring) of existing employees.' },
    ],
    5: [
      { key: 'a', label: '(a) public assistance benefits', description: 'Eligibility for essential public assistance benefits/services.' },
      { key: 'b', label: '(b) creditworthiness', description: 'Creditworthiness / credit-scoring of natural persons.' },
      { key: 'c', label: '(c) life / health insurance', description: 'Risk assessment / pricing for life / health insurance.' },
      { key: 'd', label: '(d) emergency dispatch', description: 'Emergency call dispatching / triage.' },
    ],
    6: [
      { key: 'a', label: '(a) victim-risk assessment', description: 'Risk of a natural person becoming victim of a criminal offence.' },
      { key: 'b', label: '(b) polygraph / lie detector', description: 'Polygraph or similar tool in law-enforcement context.' },
      { key: 'c', label: '(c) evidence reliability', description: 'Assessing reliability of evidence in criminal investigations / prosecutions.' },
      { key: 'd', label: '(d) profiling for criminal-offence risk', description: 'Risk assessment via profiling (NOT solely-on-profiling, which is Art 5(1)(d) prohibited).' },
      { key: 'e', label: '(e) deep crime-data analysis', description: 'Deep analytical crime-data analysis.' },
    ],
    7: [
      { key: 'a', label: '(a) polygraph at borders', description: 'Polygraphs or similar in migration / asylum / border-control context.' },
      { key: 'b', label: '(b) migration / asylum risk assessment', description: 'Risk assessment for migration, asylum, or border control.' },
      { key: 'c', label: '(c) examining applications', description: 'Examining applications for visa / asylum / residence permits.' },
      { key: 'd', label: '(d) detection / identification at borders', description: 'Detection / identification at borders (excluding Art 5(1)(h) prohibited real-time RBI).' },
    ],
    8: [
      { key: 'a', label: '(a) judicial research / interpretation', description: 'Used by judicial authorities for research / interpretation / application of law.' },
      { key: 'b', label: '(b) election influencing', description: 'Intended to influence elections or referenda results or voting behaviour.' },
    ],
  },
  article_50: [
    {
      key: '50(1)',
      label: '50(1) Direct-interaction AI (chatbot disclosure)',
      description:
        'AI system intended to interact directly with natural persons — must disclose to the user that they are interacting with an AI (e.g., chatbots, virtual assistants).',
    },
    {
      key: '50(2)',
      label: '50(2) Generative AI synthetic content marking',
      description:
        'Provider of GPAI / generative AI producing synthetic audio/image/video/text — output must be marked in machine-readable format as artificially generated.',
    },
    {
      key: '50(3)',
      label: '50(3) Emotion-recognition / biometric-categorisation deployer disclosure',
      description:
        'Deployer of emotion-recognition OR biometric-categorisation system — must inform exposed natural persons of the system\'s operation.',
    },
    {
      key: '50(4)_sub1',
      label: '50(4) Deepfake disclosure',
      description:
        'Deployer of AI generating or manipulating image / audio / video content that constitutes a deep fake — must disclose artificial generation (artistic / parody / commentary exception applies).',
    },
    {
      key: '50(4)_sub2',
      label: '50(4) Public-interest AI-generated text disclosure',
      description:
        'Deployer of AI generating or manipulating TEXT that is published to inform the public on matters of public interest — must disclose artificial generation / manipulation (editorial-responsibility exception applies).',
    },
  ],
  result_intro:
    'Classification (based on your selections):',
  banner:
    'Lucairn AI Act classifier — guided mode\n' +
    'Maps your structured selections to EU AI Act articles, paragraphs, and sub-letters with the same rules engine as free-text mode.\n' +
    'Output cites EUR-Lex Regulation (EU) 2024/1689.\n',
};

export const PROMPTS_DE: WizardPrompts = {
  step_intro: {
    step1:
      'Schritt 1 von 3 — Artikel 5 Absatz 1 verbotene Praktiken. Bitte je Ja/Nein antworten.',
    step2:
      'Schritt 2 von 3 — Artikel 6 + Anhang III Hochrisiko-Einstufung. Bitte je Ja/Nein antworten. Bei Ja können Sie auf spezifische Buchstaben einengen (a/b/c/d/...).',
    step3:
      'Schritt 3 von 3 — Artikel 50 Transparenzpflichten. Bitte je Ja/Nein antworten.',
    submit:
      'Alle Antworten erfasst. Klassifizierung wird erstellt…',
  },
  yes_no: { yes: 'ja', no: 'nein', yes_short: 'j', no_short: 'n' },
  article_5: [
    {
      key: 'a',
      label: '(a) Unterschwellige / täuschende Techniken',
      description:
        'KI-System, das unterschwellige Techniken jenseits des Bewusstseins einer Person oder absichtlich manipulative/täuschende Techniken einsetzt, mit dem Ziel oder der Wirkung, das Verhalten wesentlich zu verzerren und erheblichen Schaden zu verursachen.',
    },
    {
      key: 'b',
      label: '(b) Ausnutzung von Schutzbedürftigkeit',
      description:
        'KI-System, das die Schutzbedürftigkeit natürlicher Personen (Alter, Behinderung, soziale/wirtschaftliche Lage) ausnutzt, um das Verhalten wesentlich zu verzerren und erheblichen Schaden zu verursachen.',
    },
    {
      key: 'c',
      label: '(c) Soziale Bewertung (Social Scoring)',
      description:
        'KI-System zur sozialen Bewertung natürlicher Personen, die zu einer nachteiligen Behandlung in von der ursprünglichen Bewertung losgelösten sozialen Kontexten führt.',
    },
    {
      key: 'd',
      label: '(d) Vorhersagende Polizeiarbeit (ausschließlich auf Profiling)',
      description:
        'KI-System, das Straftaten natürlicher Personen ausschließlich auf der Grundlage von Profiling oder der Bewertung von Persönlichkeitsmerkmalen vorhersagt (vs. Anhang III ¶6(d) — breiter, hochrisikobehaftet, nicht verboten).',
    },
    {
      key: 'e',
      label: '(e) Ungezieltes Auslesen von Gesichtsbildern',
      description:
        'KI-System zum Aufbau / zur Erweiterung von Gesichtserkennungsdatenbanken durch ungezieltes Auslesen von Gesichtsbildern aus dem Internet oder von Überwachungskameras.',
    },
    {
      key: 'f',
      label: '(f) Emotionserkennung am Arbeitsplatz / in der Bildung',
      description:
        'KI-System, das Emotionen natürlicher Personen am Arbeitsplatz oder in Bildungseinrichtungen ableitet (mit medizinischen/Sicherheits-Ausnahmen; Ausnahme wird ausgelöst, wenn Ihre Beschreibung "medizinisch" oder "Sicherheitsgründen" enthält).',
    },
    {
      key: 'g',
      label: '(g) Biometrische Kategorisierung nach geschützten Merkmalen',
      description:
        'KI-System zur biometrischen Kategorisierung natürlicher Personen zur Ableitung von Rasse, politischer Meinung, Gewerkschaftszugehörigkeit, religiösen/weltanschaulichen Überzeugungen, Sexualleben oder sexueller Orientierung.',
    },
    {
      key: 'h',
      label: '(h) Echtzeit-Fernidentifizierung im öffentlich zugänglichen Raum (Strafverfolgung)',
      description:
        'KI-System zur biometrischen Echtzeit-Fernidentifizierung in öffentlich zugänglichen Räumen zu Strafverfolgungszwecken (nur enge gesetzliche Ausnahmen).',
    },
  ],
  annex_iii: [
    {
      key: 1,
      label: '¶1 Biometrie',
      description:
        'KI-Systeme zur biometrischen Fernidentifizierung, biometrischen Kategorisierung nach geschützten Merkmalen (außer Identitätsprüfung) oder Emotionserkennung.',
    },
    {
      key: 2,
      label: '¶2 Kritische Infrastruktur',
      description:
        'KI-Systeme als Sicherheitskomponenten kritischer digitaler Infrastruktur, im Straßenverkehr oder in der Versorgung mit Wasser/Gas/Wärme/Strom.',
    },
    {
      key: 3,
      label: '¶3 Bildung / berufliche Bildung',
      description:
        'KI-Systeme zur Bestimmung des Zugangs zu Bildungseinrichtungen, Bewertung von Lernergebnissen, Bestimmung des angemessenen Bildungsniveaus oder Überwachung verbotenen Verhaltens bei Prüfungen.',
    },
    {
      key: 4,
      label: '¶4 Beschäftigung / Personalmanagement',
      description:
        'KI-Systeme zur Einstellung / Auswahl (Lebenslauf-Screening, Bewerberranking), Arbeitsplatzentscheidungen (Beförderung, Kündigung, Aufgabenverteilung) oder Leistungsüberwachung bestehender Beschäftigter.',
    },
    {
      key: 5,
      label: '¶5 Wesentliche öffentliche/private Dienste',
      description:
        'KI-Systeme zur Anspruchsprüfung öffentlicher Leistungen, Kreditwürdigkeit/Bonitätsbewertung, Risikobewertung/Tarifierung Lebens-/Krankenversicherung oder Notrufdisposition.',
    },
    {
      key: 6,
      label: '¶6 Strafverfolgung',
      description:
        'KI-Systeme zur Risikobewertung natürlicher Personen als potenzielle Opfer, Polygraphen, Beweismittelzuverlässigkeit, Profiling oder Tiefenanalyse von Kriminalitätsdaten.',
    },
    {
      key: 7,
      label: '¶7 Migration / Asyl / Grenzkontrolle',
      description:
        'KI-Systeme zur Risikobewertung im Migrations-/Asyl-/Grenzkontroll-Kontext, Polygraphen, Prüfung von Anträgen oder Erkennung/Identifizierung an Grenzen.',
    },
    {
      key: 8,
      label: '¶8 Rechtspflege / Demokratie',
      description:
        'KI-Systeme durch Justizbehörden zur Rechtsrecherche/-auslegung/-anwendung oder KI-Systeme zur Beeinflussung von Wahlen oder Wahlverhalten.',
    },
  ],
  annex_iii_sub_letters: {
    1: [
      { key: 'a', label: '(a) biometrische Fernidentifizierung', description: 'Systeme zur biometrischen Fernidentifizierung.' },
      { key: 'b', label: '(b) biometrische Kategorisierung', description: 'Biometrische Kategorisierung nach geschützten Merkmalen.' },
      { key: 'c', label: '(c) Emotionserkennung', description: 'Emotionserkennung (in nicht-verbotenen Kontexten).' },
    ],
    2: [
      { key: 'a', label: '(a) digitale Infrastruktur', description: 'Sicherheitskomponenten kritischer digitaler Infrastruktur.' },
      { key: 'b', label: '(b) Wasser / Gas / Wärme / Strom', description: 'Versorgung mit Wasser, Gas, Wärme, Strom.' },
      { key: 'c', label: '(c) Straßenverkehr', description: 'Sicherheitskomponenten im Straßenverkehr.' },
    ],
    3: [
      { key: 'a', label: '(a) Zugang zur Bildung', description: 'Bestimmung des Zugangs / Zulassung zu Bildungseinrichtungen.' },
      { key: 'b', label: '(b) Lernergebnisse', description: 'Bewertung von Lernergebnissen.' },
      { key: 'c', label: '(c) angemessenes Bildungsniveau', description: 'Bewertung des angemessenen Bildungsniveaus einer Person.' },
      { key: 'd', label: '(d) Prüfungsüberwachung', description: 'Überwachung / Erkennung verbotenen Verhaltens bei Prüfungen.' },
    ],
    4: [
      { key: 'a', label: '(a) Einstellung / Auswahl', description: 'Einstellung / Auswahl natürlicher Personen (Stellenanzeigen, Lebenslauf-/Bewerbungsscreening, Bewertung von Bewerbern).' },
      { key: 'b', label: '(b) Arbeitsplatzentscheidungen', description: 'Entscheidungen über Arbeitsbedingungen (Beförderung, Kündigung, Aufgabenverteilung, Leistungsüberwachung) bestehender Beschäftigter.' },
    ],
    5: [
      { key: 'a', label: '(a) öffentliche Leistungen', description: 'Anspruch auf wesentliche öffentliche Unterstützungsleistungen/Dienste.' },
      { key: 'b', label: '(b) Kreditwürdigkeit', description: 'Kreditwürdigkeit / Bonitätsbewertung natürlicher Personen.' },
      { key: 'c', label: '(c) Lebens- / Krankenversicherung', description: 'Risikobewertung / Tarifierung Lebens- / Krankenversicherung.' },
      { key: 'd', label: '(d) Notrufdisposition', description: 'Notrufdisposition / Triage.' },
    ],
    6: [
      { key: 'a', label: '(a) Opfer-Risiko-Bewertung', description: 'Risiko, dass eine Person Opfer einer Straftat wird.' },
      { key: 'b', label: '(b) Polygraph / Lügendetektor', description: 'Polygraph oder ähnliches Instrument im Strafverfolgungs-Kontext.' },
      { key: 'c', label: '(c) Beweismittelzuverlässigkeit', description: 'Bewertung der Zuverlässigkeit von Beweismitteln in Strafermittlungen.' },
      { key: 'd', label: '(d) Profiling auf Straftat-Risiko', description: 'Risikobewertung via Profiling (NICHT ausschließlich auf Profiling, was Art 5(1)(d) verboten wäre).' },
      { key: 'e', label: '(e) Tiefenanalyse von Kriminalitätsdaten', description: 'Tiefenanalyse von Kriminalitätsdaten.' },
    ],
    7: [
      { key: 'a', label: '(a) Polygraph an Grenzen', description: 'Polygraphen oder ähnliches im Migrations- / Asyl- / Grenzkontroll-Kontext.' },
      { key: 'b', label: '(b) Migrations- / Asyl-Risikobewertung', description: 'Risikobewertung für Migration, Asyl oder Grenzkontrolle.' },
      { key: 'c', label: '(c) Prüfung von Anträgen', description: 'Prüfung von Visa- / Asyl- / Aufenthaltsanträgen.' },
      { key: 'd', label: '(d) Erkennung / Identifizierung an Grenzen', description: 'Erkennung / Identifizierung an Grenzen (außer Art 5(1)(h) verbotene Echtzeit-RBI).' },
    ],
    8: [
      { key: 'a', label: '(a) richterliche Forschung / Auslegung', description: 'Einsatz durch Justizbehörden zur Forschung / Auslegung / Anwendung des Rechts.' },
      { key: 'b', label: '(b) Wahlbeeinflussung', description: 'Beeinflussung von Wahlen oder Referenden oder Wahlverhalten.' },
    ],
  },
  article_50: [
    {
      key: '50(1)',
      label: '50(1) Direkter Interaktions-KI (Chatbot-Offenlegung)',
      description:
        'KI-System zur direkten Interaktion mit natürlichen Personen — muss dem Nutzer offenlegen, dass er mit einer KI interagiert (z.B. Chatbots, virtuelle Assistenten).',
    },
    {
      key: '50(2)',
      label: '50(2) Generative KI: Markierung synthetischer Inhalte',
      description:
        'Anbieter generativer KI, die synthetische Audio-/Bild-/Video-/Textinhalte erzeugt — Ausgabe muss in maschinenlesbarer Form als künstlich erzeugt markiert werden.',
    },
    {
      key: '50(3)',
      label: '50(3) Emotionserkennung / biometrische Kategorisierung — Betreiber-Offenlegung',
      description:
        'Betreiber eines Emotionserkennungs- ODER biometrischen Kategorisierungssystems — muss betroffene natürliche Personen über den Betrieb des Systems informieren.',
    },
    {
      key: '50(4)_sub1',
      label: '50(4) Deepfake-Offenlegung',
      description:
        'Betreiber von KI zur Erzeugung / Manipulation von Bild- / Audio- / Videoinhalten, die einen Deepfake darstellen — muss die künstliche Erzeugung offenlegen (Ausnahme für Kunst / Parodie / Kommentar).',
    },
    {
      key: '50(4)_sub2',
      label: '50(4) KI-generierte Texte von öffentlichem Interesse',
      description:
        'Betreiber von KI, die TEXTE erzeugt / manipuliert, die zur öffentlichen Information über Angelegenheiten von öffentlichem Interesse veröffentlicht werden — muss die künstliche Erzeugung / Manipulation offenlegen (Ausnahme für redaktionelle Verantwortung).',
    },
  ],
  result_intro:
    'Klassifizierung (auf Basis Ihrer Auswahl):',
  banner:
    'Lucairn EU-KI-VO-Klassifizierer — geführter Modus\n' +
    'Bildet Ihre strukturierten Auswahlen auf EU-KI-VO-Artikel, Absätze und Buchstaben mit derselben Regel-Engine wie der Freitext-Modus ab.\n' +
    'Ausgabe zitiert EUR-Lex Verordnung (EU) 2024/1689.\n',
};
