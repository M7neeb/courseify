// Board preferences for the Chess section: colours, what the board shows, sounds. Kept on this
// device only (a convenience, like chess.com's board settings).

export type BoardTheme = 'green' | 'brown' | 'blue' | 'purple' | 'gray';
export const BOARD_THEMES: BoardTheme[] = ['green', 'brown', 'blue', 'purple', 'gray'];

export interface ChessPrefs {
  theme: BoardTheme;
  /** Dots on the squares a picked-up piece can move to. */
  legal: boolean;
  /** Letters and numbers along the edge. */
  coords: boolean;
  /** Move, capture and check sounds in games. */
  sounds: boolean;
  /** Promote to a queen without asking. */
  autoQueen: boolean;
  /** Pieces slide to their new square. */
  animate: boolean;
  /** Move in advance while the bot is thinking. */
  premoves: boolean;
}

const KEY = 'courseify:chessPrefs';
const DEFAULTS: ChessPrefs = { theme: 'green', legal: true, coords: true, sounds: true, autoQueen: false, animate: true, premoves: true };

function read(): ChessPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ChessPrefs>;
    const out = { ...DEFAULTS };
    if (BOARD_THEMES.includes(raw.theme as BoardTheme)) out.theme = raw.theme as BoardTheme;
    for (const k of ['legal', 'coords', 'sounds', 'autoQueen', 'animate', 'premoves'] as const) {
      if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

export const chessPrefs = $state<ChessPrefs>(read());

export function setChessPref<K extends keyof ChessPrefs>(key: K, value: ChessPrefs[K]): void {
  chessPrefs[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify($state.snapshot(chessPrefs)));
  } catch {
    /* only a convenience */
  }
}
