// Well-known openings, for the game review: moves that follow one of these lines are "book"
// moves, and the longest line a game follows names its opening. Lines are in SAN from the start.

import { Chess } from 'chess.js';

export interface Opening {
  en: string;
  de: string;
  moves: string;
}

export const OPENINGS: readonly Opening[] = [
  { en: "King's Pawn Opening", de: 'Königsbauernspiel', moves: 'e4' },
  { en: "King's Pawn Game", de: 'Offene Spiele', moves: 'e4 e5' },
  { en: 'Italian Game', de: 'Italienische Partie', moves: 'e4 e5 Nf3 Nc6 Bc4' },
  { en: 'Giuoco Piano', de: 'Giuoco Piano', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5' },
  { en: 'Giuoco Pianissimo', de: 'Giuoco Pianissimo', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3' },
  { en: 'Evans Gambit', de: 'Evans-Gambit', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4' },
  { en: 'Two Knights Defense', de: 'Zweispringerspiel im Nachzuge', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6' },
  { en: 'Fried Liver Attack', de: 'Fegatello-Angriff', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7' },
  { en: 'Ruy Lopez', de: 'Spanische Partie', moves: 'e4 e5 Nf3 Nc6 Bb5' },
  { en: 'Ruy Lopez, Morphy Defense', de: 'Spanische Partie, Morphy-Verteidigung', moves: 'e4 e5 Nf3 Nc6 Bb5 a6' },
  { en: 'Ruy Lopez, Closed', de: 'Spanische Partie, geschlossene Variante', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7' },
  { en: 'Ruy Lopez, Berlin Defense', de: 'Spanische Partie, Berliner Verteidigung', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6' },
  { en: 'Scotch Game', de: 'Schottische Partie', moves: 'e4 e5 Nf3 Nc6 d4' },
  { en: 'Scotch Game', de: 'Schottische Partie', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4' },
  { en: 'Four Knights Game', de: 'Vierspringerspiel', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6' },
  { en: 'Ponziani Opening', de: 'Ponziani-Eröffnung', moves: 'e4 e5 Nf3 Nc6 c3' },
  { en: "Petrov's Defense", de: 'Russische Verteidigung', moves: 'e4 e5 Nf3 Nf6' },
  { en: 'Stafford Gambit', de: 'Stafford-Gambit', moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6' },
  { en: 'Philidor Defense', de: 'Philidor-Verteidigung', moves: 'e4 e5 Nf3 d6' },
  { en: "King's Gambit", de: 'Königsgambit', moves: 'e4 e5 f4' },
  { en: "King's Gambit Accepted", de: 'Angenommenes Königsgambit', moves: 'e4 e5 f4 exf4' },
  { en: 'Vienna Game', de: 'Wiener Partie', moves: 'e4 e5 Nc3' },
  { en: "Bishop's Opening", de: 'Läuferspiel', moves: 'e4 e5 Bc4' },
  { en: 'Center Game', de: 'Mittelgambit', moves: 'e4 e5 d4 exd4 Qxd4' },
  { en: 'Danish Gambit', de: 'Nordisches Gambit', moves: 'e4 e5 d4 exd4 c3' },
  { en: 'Sicilian Defense', de: 'Sizilianische Verteidigung', moves: 'e4 c5' },
  { en: 'Sicilian Defense, Open', de: 'Sizilianisch, offene Variante', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4' },
  { en: 'Sicilian Defense, Najdorf', de: 'Sizilianisch, Najdorf-Variante', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  { en: 'Sicilian Defense, Dragon', de: 'Sizilianisch, Drachenvariante', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6' },
  { en: 'Sicilian Defense, Open', de: 'Sizilianisch, offene Variante', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4' },
  { en: 'Sicilian Defense, Open', de: 'Sizilianisch, offene Variante', moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4' },
  { en: 'Sicilian Defense, Alapin', de: 'Sizilianisch, Alapin-Variante', moves: 'e4 c5 c3' },
  { en: 'Sicilian Defense, Closed', de: 'Sizilianisch, geschlossene Variante', moves: 'e4 c5 Nc3' },
  { en: 'Sicilian Defense, Smith-Morra Gambit', de: 'Sizilianisch, Morra-Gambit', moves: 'e4 c5 d4 cxd4 c3' },
  { en: 'French Defense', de: 'Französische Verteidigung', moves: 'e4 e6' },
  { en: 'French Defense', de: 'Französische Verteidigung', moves: 'e4 e6 d4 d5' },
  { en: 'French Defense, Advance', de: 'Französisch, Vorstoßvariante', moves: 'e4 e6 d4 d5 e5' },
  { en: 'French Defense, Exchange', de: 'Französisch, Abtauschvariante', moves: 'e4 e6 d4 d5 exd5 exd5' },
  { en: 'French Defense, Winawer', de: 'Französisch, Winawer-Variante', moves: 'e4 e6 d4 d5 Nc3 Bb4' },
  { en: 'Caro-Kann Defense', de: 'Caro-Kann-Verteidigung', moves: 'e4 c6' },
  { en: 'Caro-Kann Defense', de: 'Caro-Kann-Verteidigung', moves: 'e4 c6 d4 d5' },
  { en: 'Caro-Kann Defense, Advance', de: 'Caro-Kann, Vorstoßvariante', moves: 'e4 c6 d4 d5 e5' },
  { en: 'Caro-Kann Defense, Classical', de: 'Caro-Kann, klassische Variante', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },
  { en: 'Scandinavian Defense', de: 'Skandinavische Verteidigung', moves: 'e4 d5' },
  { en: 'Scandinavian Defense', de: 'Skandinavische Verteidigung', moves: 'e4 d5 exd5 Qxd5' },
  { en: 'Pirc Defense', de: 'Pirc-Verteidigung', moves: 'e4 d6 d4 Nf6 Nc3 g6' },
  { en: 'Modern Defense', de: 'Moderne Verteidigung', moves: 'e4 g6' },
  { en: "Alekhine's Defense", de: 'Aljechin-Verteidigung', moves: 'e4 Nf6' },
  { en: 'Nimzowitsch Defense', de: 'Nimzowitsch-Verteidigung', moves: 'e4 Nc6' },
  { en: "Owen's Defense", de: 'Owen-Verteidigung', moves: 'e4 b6' },
  { en: "Queen's Pawn Opening", de: 'Damenbauernspiel', moves: 'd4' },
  { en: "Queen's Pawn Game", de: 'Geschlossene Spiele', moves: 'd4 d5' },
  { en: "Queen's Gambit", de: 'Damengambit', moves: 'd4 d5 c4' },
  { en: "Queen's Gambit Declined", de: 'Abgelehntes Damengambit', moves: 'd4 d5 c4 e6' },
  { en: "Queen's Gambit Declined", de: 'Abgelehntes Damengambit', moves: 'd4 d5 c4 e6 Nc3 Nf6' },
  { en: "Queen's Gambit Accepted", de: 'Angenommenes Damengambit', moves: 'd4 d5 c4 dxc4' },
  { en: 'Slav Defense', de: 'Slawische Verteidigung', moves: 'd4 d5 c4 c6' },
  { en: 'Semi-Slav Defense', de: 'Halbslawische Verteidigung', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6' },
  { en: 'Albin Countergambit', de: 'Albins Gegengambit', moves: 'd4 d5 c4 e5' },
  { en: 'London System', de: 'Londoner System', moves: 'd4 d5 Bf4' },
  { en: 'London System', de: 'Londoner System', moves: 'd4 d5 Nf3 Nf6 Bf4' },
  { en: 'London System', de: 'Londoner System', moves: 'd4 Nf6 Bf4' },
  { en: 'London System', de: 'Londoner System', moves: 'd4 Nf6 Nf3 d5 Bf4' },
  { en: 'Jobava London System', de: 'Jobava-London-System', moves: 'd4 d5 Nc3 Nf6 Bf4' },
  { en: 'Colle System', de: 'Colle-System', moves: 'd4 d5 Nf3 Nf6 e3' },
  { en: 'Indian Defense', de: 'Indische Verteidigung', moves: 'd4 Nf6' },
  { en: 'Indian Defense', de: 'Indische Verteidigung', moves: 'd4 Nf6 c4' },
  { en: "King's Indian Defense", de: 'Königsindische Verteidigung', moves: 'd4 Nf6 c4 g6 Nc3 Bg7' },
  { en: "King's Indian Defense", de: 'Königsindische Verteidigung', moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6' },
  { en: 'Grünfeld Defense', de: 'Grünfeld-Indische Verteidigung', moves: 'd4 Nf6 c4 g6 Nc3 d5' },
  { en: 'Nimzo-Indian Defense', de: 'Nimzowitsch-Indische Verteidigung', moves: 'd4 Nf6 c4 e6 Nc3 Bb4' },
  { en: "Queen's Indian Defense", de: 'Damenindische Verteidigung', moves: 'd4 Nf6 c4 e6 Nf3 b6' },
  { en: 'Catalan Opening', de: 'Katalanische Eröffnung', moves: 'd4 Nf6 c4 e6 g3' },
  { en: 'Benoni Defense', de: 'Benoni-Verteidigung', moves: 'd4 Nf6 c4 c5' },
  { en: 'Budapest Gambit', de: 'Budapester Gambit', moves: 'd4 Nf6 c4 e5' },
  { en: 'Dutch Defense', de: 'Holländische Verteidigung', moves: 'd4 f5' },
  { en: 'Englund Gambit', de: 'Englund-Gambit', moves: 'd4 e5' },
  { en: 'English Opening', de: 'Englische Eröffnung', moves: 'c4' },
  { en: 'English Opening', de: 'Englische Eröffnung', moves: 'c4 e5' },
  { en: 'English Opening', de: 'Englische Eröffnung', moves: 'c4 Nf6' },
  { en: 'Zukertort Opening', de: 'Zukertort-Eröffnung', moves: 'Nf3' },
  { en: 'Réti Opening', de: 'Réti-Eröffnung', moves: 'Nf3 d5 c4' },
  { en: "King's Indian Attack", de: 'Königsindischer Angriff', moves: 'Nf3 d5 g3' },
  { en: "Bird's Opening", de: 'Bird-Eröffnung', moves: 'f4' },
  { en: "Larsen's Opening", de: 'Larsen-Eröffnung', moves: 'b3' },
  { en: 'Polish Opening', de: 'Polnische Eröffnung', moves: 'b4' },
  { en: "Van 't Kruijs Opening", de: "Van-'t-Kruijs-Eröffnung", moves: 'e3' },
  { en: 'Hungarian Opening', de: 'Ungarische Eröffnung', moves: 'g3' }
];

interface BookLine {
  opening: Opening;
  uci: string[];
}

let book: BookLine[] | null = null;

/** The opening lines as UCI moves, built once on first use. */
function bookLines(): BookLine[] {
  if (book) return book;
  book = OPENINGS.map((opening) => {
    const game = new Chess();
    const uci = opening.moves.split(' ').map((san) => {
      const m = game.move(san);
      return m.from + m.to + (m.promotion ?? '');
    });
    return { opening, uci };
  });
  return book;
}

/**
 * For a game from the normal start: how many of its first moves are book moves, and the name of
 * the longest opening line it follows. Games from another position have no book.
 */
export function openingOf(movesUci: readonly string[], fromStart = true): { bookPlies: number; opening: Opening | null } {
  if (!fromStart) return { bookPlies: 0, opening: null };
  let bookPlies = 0;
  let best: BookLine | null = null;
  for (const line of bookLines()) {
    let n = 0;
    while (n < line.uci.length && n < movesUci.length && line.uci[n] === movesUci[n]) n += 1;
    if (n > bookPlies) bookPlies = n;
    // The game follows the whole line: a candidate name. Longer lines are more specific.
    if (n === line.uci.length && (!best || line.uci.length >= best.uci.length)) best = line;
  }
  return { bookPlies, opening: best?.opening ?? null };
}
