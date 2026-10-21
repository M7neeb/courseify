// The courses that come with the app, one entry per file in courses/ (the file is `<id>.json`).
// Plain data so the unit tests can check it against the files: a course file without an entry here,
// or an entry whose title, version or lesson count no longer matches its file, fails `npm test`.

export interface CatalogInfo {
  id: string;
  title: string;
  subject: string;
  summary: string;
  /** Matches the course's own `version`; a newer one offers an update that keeps progress. */
  version: string;
  lessons: number;
}

export const CATALOG_INFO: CatalogInfo[] = [
  {
    id: 'chess-to-1000',
    title: 'Chess: from improver to 1000',
    subject: 'Chess',
    summary: 'Stop losing pieces, win material with forks, pins and skewers, learn the mating patterns and the endgames, and play it all out on the board. 118 puzzles from real games.',
    version: '1.0',
    lessons: 17
  },
  {
    id: 'it-systeme-zahlen-einheiten',
    title: 'IT-Systeme: EVA-Modell, Einheiten und Zahlensysteme',
    subject: 'IT-Systeme',
    summary: 'Hardware und Software, das erweiterte EVA-Modell mit Schnittstellen, Bit und Byte, KiB gegen KB, Dual, Dezimal und Hex in alle Richtungen, Bitbedarf, Datenraten und Übertragungszeiten, dazu SSD und HDD.',
    version: '1.0',
    lessons: 19
  },
  {
    id: 'datenbanken-erm',
    title: 'Datenbanken: ER-Modell, Schlüssel und Tabellen',
    subject: 'Datenbanken',
    summary: 'Primär- und Fremdschlüssel, Kardinalitäten, ER-Diagramme zeichnen, vom Text zum ERD, vom ERD zu Tabellen, Datentypen, CREATE TABLE und Fehler in Tabellen finden. Mit vollständig gelösten Szenarien.',
    version: '1.0',
    lessons: 20
  },
  {
    id: 'elektrotechnik-grundlagen',
    title: 'Elektrotechnik: Strom, Leistung und Wechselspannung',
    subject: 'Elektrotechnik',
    summary: 'SI-Präfixe, Arbeitsstättenverordnung, Ohmsches Gesetz, Leiterwiderstand, Reihen- und Parallelschaltung, Leistung, Wirkungsgrad, Arbeit, Stromkosten und sinusförmige Wechselspannung. Mit vielen durchgerechneten Aufgaben.',
    version: '1.0',
    lessons: 23
  },
  {
    id: 'pflichtenheft',
    title: 'Das Pflichtenheft verstehen',
    subject: 'Softwareentwicklung',
    summary: 'Was ein Pflichtenheft ist, wie es sich vom Lastenheft unterscheidet, seine sieben Kapitel und wie man Anforderungen richtig zuordnet, Satz für Satz an einem echten Gesprächsprotokoll.',
    version: '1.0',
    lessons: 11
  }
];
