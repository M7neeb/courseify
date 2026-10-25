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
    version: '1.1',
    lessons: 19
  },
  {
    id: 'datenbanken-erm',
    title: 'Datenbanken: ER-Modell, Schlüssel und Tabellen',
    subject: 'Datenbanken',
    summary: 'Primär- und Fremdschlüssel, Kardinalitäten, ER-Diagramme zeichnen, vom Text zum ERD, vom ERD zu Tabellen, Datentypen, CREATE TABLE und Fehler in Tabellen finden. Mit vollständig gelösten Szenarien.',
    version: '1.1',
    lessons: 20
  },
  {
    id: 'elektrotechnik-grundlagen',
    title: 'Elektrotechnik: Strom, Leistung und Wechselspannung',
    subject: 'Elektrotechnik',
    summary: 'SI-Präfixe, Arbeitsstättenverordnung, Ohmsches Gesetz, Leiterwiderstand, Reihen- und Parallelschaltung, Leistung, Wirkungsgrad, Arbeit, Stromkosten und sinusförmige Wechselspannung. Mit vielen durchgerechneten Aufgaben.',
    version: '1.1',
    lessons: 23
  },
  {
    id: 'pflichtenheft',
    title: 'Das Pflichtenheft verstehen',
    subject: 'Softwareentwicklung',
    summary: 'Was ein Pflichtenheft ist, wie es sich vom Lastenheft unterscheidet, seine sieben Kapitel und wie man Anforderungen richtig zuordnet, Satz für Satz an einem echten Gesprächsprotokoll.',
    version: '1.0',
    lessons: 11
  },
  {
    id: 'sql-detektiv',
    title: 'SQL-Detektiv: Der Fall des Blauen Kristalls',
    subject: 'Datenbanken',
    summary: 'SQL lernen in einer Detektivgeschichte: SELECT, WHERE, ORDER BY, Zählen, GROUP BY und JOIN. Du schreibst echte Abfragen in der App, ohne Installation und ohne Internet.',
    version: '1.0',
    lessons: 7
  },
  {
    id: 'programmieren-grundlagen',
    title: 'Programmieren: Pseudocode und Python',
    subject: 'Programmieren',
    summary: 'Variablen, Verzweigungen, Schleifen, Listen und Funktionen: erst mit Ablauftabellen und Pseudocode, dann in echtem Python, das du direkt in der App schreibst und testest.',
    version: '1.0',
    lessons: 8
  },
  {
    id: 'linux-kommandozeile',
    title: 'Linux: Die Kommandozeile von Grund auf',
    subject: 'Betriebssysteme',
    summary: 'pwd, ls, cd, cat, mkdir, cp, mv, rm, echo und Dateirechte, geübt in einem kleinen Terminal mit eigenem Dateibaum, in dem nichts kaputtgehen kann.',
    version: '1.0',
    lessons: 7
  },
  {
    id: 'it-sicherheit-grundlagen',
    title: 'IT-Sicherheit: Schutzziele, Phishing und Passwörter',
    subject: 'IT-Sicherheit',
    summary: 'Schutzziele nach BSI, Malware und Social Engineering, Phishing erkennen, Passwörter und zweiter Faktor, Hashes und Verschlüsselung, Backup, WLAN und Datenschutz. Mit Hash-Labor und Passwort-Prüfung.',
    version: '1.0',
    lessons: 7
  },
  {
    id: 'ap1-wiso-rechnen',
    title: 'Wirtschaft und Rechnen: Prozent, Netzplan, Kosten und Ausbildungsrecht',
    subject: 'Wirtschaft',
    summary: 'Prozent und Mehrwertsteuer, Dreisatz, Rabatt und Skonto, Zinsen, Netzplan mit kritischem Weg, Amortisation, Gewinnschwelle, Ausbildungsvertrag und Sozialversicherung. Mit Netzplan-Rechner.',
    version: '1.0',
    lessons: 8
  }
];
