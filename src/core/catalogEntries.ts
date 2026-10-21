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
    id: 'zahlensysteme-und-speicher',
    title: 'Zahlensysteme, Einheiten und Speicher',
    subject: 'Informatik',
    summary: 'Dual, Dezimal und Hex sicher umrechnen, Bit und Byte, 1000 gegen 1024, Übertragungszeiten, das EVA-Modell und wie SSDs funktionieren. Mit vielen durchgerechneten Beispielen und Übungsaufgaben.',
    version: '1.0',
    lessons: 21
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
