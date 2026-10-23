// The single source of truth for the app version and the "What's new" list.
// Bump VERSION and add one CHANGELOG entry at the top when you ship user-visible changes.

export const VERSION = '1.7.1';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/** Newest first. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.7.1',
    date: '2026-10-23',
    changes: ['Fixed: short messages at the bottom of the screen (such as "2 milestones reached") wrapped into a narrow column on phones.']
  },
  {
    version: '1.7.0',
    date: '2026-10-23',
    changes: [
      'Chess: play against 13 bots from 250 to 3000 Elo. After the game you get a full review: go through it move by move, from brilliant moves to blunders, with the best move shown on the board and your accuracy. Plus endgame drills and a free board.',
      'Drills: endless practice with new numbers every time. Number systems, storage units, download times and subnets for IT; equations, percent, fractions, powers of ten, Ohm\'s law, quadratic equations and straight lines for maths. Each problem has a worked solution you can open step by step. There is also a graph plotter with sliders.',
      'New kinds of questions: written answers you compare with a model answer, questions where you tap the right spot on a picture, and programming exercises in Python or JavaScript that run in the app and are checked by tests.',
      'Mock exam: a timed test from a whole course, with no hints, graded at the end. Set an exam date for a course and the start page plans your learning and review time up to that day.',
      'A weekly report and milestones on the Progress page.',
      'Lessons can show formulas, diagrams and graphs with sliders. Technical terms are underlined; tap one to see what it means.',
      'Report a question that seems wrong. The course settings collect your reports and give you one prompt to have them fixed, and the answer is imported back in one step.',
      'Share a course as a file from the library. When you create a course, you can add text files as material, and pick the new "IT and networks" or "Maths" starting points.',
      'The courses IT-Systeme, Elektrotechnik and Datenbanken now have a glossary in German and English; IT-Systeme and Elektrotechnik also get drills and graphs.'
    ]
  },
  {
    version: '1.6.0',
    date: '2026-10-21',
    changes: [
      'Three new courses come with the app: "Datenbanken: ER-Modell, Schlüssel und Tabellen", "Elektrotechnik: Strom, Leistung und Wechselspannung" and "IT-Systeme: EVA-Modell, Einheiten und Zahlensysteme". All three are in German and English: switch explanations, questions and answers with the language button in each lesson.',
      'Flashcards switch language too when a course has them in both languages.',
      'Diagrams and code in lessons fit on a phone screen without scrolling sideways.',
      '"IT-Systeme" replaces "Zahlensysteme, Einheiten und Speicher" with more practice and the full EVA model with interfaces. A copy you already have stays in your library until you delete it.'
    ]
  },
  {
    version: '1.5.0',
    date: '2026-10-21',
    changes: [
      'Two new courses come with the app: "Zahlensysteme, Einheiten und Speicher" and "Das Pflichtenheft verstehen".',
      'Courses that come with the app are now in your library from the start, no need to add them. If you delete one, it stays deleted; you can add it again from Ready-made courses.'
    ]
  },
  {
    version: '1.4.3',
    date: '2026-10-20',
    changes: [
      'Fixed: "Next question" jumped to the top of the page. It now scrolls to the next question, just under the header.'
    ]
  },
  {
    version: '1.4.2',
    date: '2026-10-20',
    changes: [
      'Fixed: a lesson could stay locked for good after missing several questions. A missed question now counts again once you get it right on the first try in a later practice set.',
      'Fixed: "Practise weak skills" opened questions that were already marked as solved. Every practice set now starts fresh.'
    ]
  },
  {
    version: '1.4.1',
    date: '2026-10-20',
    changes: [
      'Fixed: "Practise mistakes only" showed the missed questions as already finished. Each one now starts fresh, with a new board for chess puzzles, so you can really try it again.'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-10-20',
    changes: [
      'Chess: a new ready-made course, "Chess: from improver to 1000", with 17 lessons and 118 puzzles from real games (Lichess puzzle database). Add it from Home or the Library.',
      'Chess puzzles: play the moves on the board, the opponent answers, and a wrong move is taken back so you can try again. Hints mark the piece and then the move.',
      'Worked examples on the board: step through the moves with a note, arrows and marked squares at every step.',
      'Play positions out against the computer, with five strengths from Beginner to Strongest, take-backs and a "show a good move" hint.',
      'The Chess board page: full games against the computer as White or Black, or from any position you paste in.',
      'The course builder has a "Learn chess" preset, so a chat AI can make chess courses with boards and puzzles.'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-10-17',
    changes: [
      'Course settings: give each course its own learning settings, for example exam prep for one subject and relaxed for another. Open a course and choose Course settings.',
      'Layouts in Settings: Standard, Simple (one column, big buttons, a tab bar), Detailed (memory strength, points, question counts and reading time) and Compact (more on one screen).',
      'Use the desktop layout on a phone or tablet if you prefer it.',
      'Phones get a tab bar at the bottom for Courses, Review, Library, Progress and Settings.',
      'Phone fixes: the library search box, bigger checkboxes, no zooming in when you tap a text field, and the activity calendar opens at the latest weeks.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-10-17',
    changes: [
      'Settings has a new "How you learn" section: pick Balanced, Exam prep, Deep understanding or Relaxed, or set every option yourself.',
      'Choose how much to remember (80-95%): the review schedule adapts.',
      'Brain dump after every lesson and unit: write what you remember, see which key points you covered, and fill the gaps.',
      'Explain it simply (the Feynman technique): explain a lesson in plain words, spot jargon, and let an AI ask you follow-up questions.',
      'Recall first: multiple choice can hide the options until you have thought of the answer.',
      'Practice sets mix in questions from earlier lessons.',
      'Small typos in typed answers can be forgiven, and hints can be switched off for exam practice.',
      'A daily goal, an "in a row" counter, a celebration when a skill levels up, and optional soft sounds.',
      'Progress shows how well your confidence matches your results.',
      'Reading options: an easier-to-read font and wider line spacing.'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-10-17',
    changes: [
      'Spaced review for every question: what you answer comes back just before you would forget it, with a daily limit so a break never turns into a pile.',
      'Today on Home: see what is due for review and carry on with your course in one tap.',
      'How sure are you? Mark Sure, Not sure or Guessing before you check. Mistakes you were sure about come back sooner.',
      'Course challenge: mixed questions from the whole course, the way to reach Mastered.',
      'Mastered skills fade back to Proficient if you do not review them, and a "Review soon" mark shows which ones.',
      'Stuck? Ask an AI tutor copies a prompt that coaches you without giving the answer away.',
      'Warm-up questions: guess before a lesson starts, which helps it stick.',
      'Course builder: a Check prompt for a second opinion on every unit, plus better questions (more variants, find-the-mistake, solved-then-your-turn examples) and "Read more" sources.'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-10-15',
    changes: [
      'The app is now called Courseify, with a new icon.',
      'A new look throughout: Explore by subject, a course sidebar, unit pages with mastery squares, and cleaner lessons, practice and review.',
      'Progress shows your mastery by subject, course and unit, and which skills to practise next.',
      'Lesson videos play right inside the lesson.',
      'A new course builder: answer six steps and get prompts for the outline, every unit and the final exam, written to produce better courses.',
      'German and English courses get a language switch inside each lesson.',
      'Removed the notebook and private question notes to keep things focused.'
    ]
  },
  {
    version: '0.8.0',
    date: '2026-10-14',
    changes: [
      'New Home screen, "My courses": a greeting with your week streak, level and skills, your profile header, and one card per course.',
      'Each course card lists its units with a mastery mark, a status line and a Resume or Start button; a unit row jumps straight into that unit.',
      'One shared mastery style (label, colour, mark) now drives every mastery indicator, so all colour themes stay consistent.'
    ]
  },
  {
    version: '0.7.0',
    date: '2026-10-14',
    changes: [
      'Practice sets: every lesson can be practised as a skill - a set of questions that puts what you missed first, then what you have not tried yet.',
      'Spaced re-review: a question you get wrong comes back in a day, then in three, then in seven, and a variant of the same question is preferred when one exists.',
      'Gating is now a setting: keep lessons locked in order, or open everything at once while still showing the recommended mastery and the jump to your weakest skill.'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-10-14',
    changes: [
      'Mastery: every lesson is a skill that earns 0-100 mastery points, with tiers from Not started to Mastered.',
      'Gating: lessons, module tests and modules unlock in order, and a locked item always shows the requirement, your current value and a jump to the weakest skill.',
      'Quiz flow: wrong answers no longer advance, hints are progressive steps, and every set ends with a results screen.',
      'Results screen: first-try score, per-skill mastery change, a module mastery bar, and the mistakes you made with the full explanation.'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-10-11',
    changes: [
      'Add a personal learning dashboard, profile menu and editable local profile.',
      'Add four complete colour palettes, activity-calendar labels, custom course levels and a dismissible backup reminder.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-10-11',
    changes: [
      'Rework the library into a resume-first course list and give lessons a calmer, wider reading layout.',
      'Add a searchable notebook for lesson and question notes, saved lessons, and Markdown export.',
      'Add interactive flashcard decks, a distraction-reduced focus mode, and lesson keyboard shortcuts.'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-10-11',
    changes: [
      'Add private notes to lessons and individual quiz questions; notes are included in backups.',
      'Search the course library, edit course tags, and sort by recent activity, title or progress.',
      'Refresh the app shell, lesson reader, quiz cards, library and controls for a clearer, more comfortable study experience.'
    ]
  },
  {
    version: '0.2.0',
    date: '2026-10-11',
    changes: [
      'New left-sidebar layout, with the current course outline under the navigation.',
      'Colour themes now recolour the whole app, each with a full light and dark palette.',
      'Review screen: practise only the questions you got wrong.',
      'Deleting a course moves it to Trash, with undo and a 30-day grace period.',
      'Backup reminder that shows how long ago you last exported a backup.',
      'Settings shows the version number and this list of changes.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-10-10',
    changes: ['First release: import course packs, read lessons, answer quizzes, track streaks and XP.']
  }
];

/** The change list for one version, or undefined if that version is not recorded. */
export function changelogFor(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((entry) => entry.version === version);
}
