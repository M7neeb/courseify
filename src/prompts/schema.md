Course JSON (schemaVersion 2). Every text field is Markdown unless noted.

LANGUAGE FIELDS
- One-language course: use the plain fields shown below (levels, markdown, prompt, options, ...). No "i18n".
- Two-language course: keep the plain fields as the first language's copy AND add "i18n": { "<lang>": { ...same fields... } } for every language, on every block and question that has text. Allowed i18n fields: text blocks "normal", "simple", "detailed"; callout/example "markdown"; image "alt", "caption"; flashcards "cards"; questions "prompt", "options", "answer", "explanation", "hint", "hints", "rationales", "pairs", "items", "points", "svg", "alt", "areaLabels".

COURSE
{ "schemaVersion": 2, "id": "course-id", "title": "…", "subject": "…", "level": "…", "language": "de", "languages": ["de"], "modules": [ Module ], "finalExam": FinalExam? }

MODULE (a unit)
{ "id": "m1", "title": "…", "summary": "1-2 sentences", "lessons": [ Lesson ], "test": ModuleTest, "glossary": [ GlossaryEntry ] }
GlossaryEntry: { "term": "primary key", "definition": "one short sentence", "aliases": ["PK"] }. Two-language courses add "i18n": { "de": { "term": "Primärschlüssel", "definition": "…" }, "en": { … } }. The app underlines these terms in the lesson text; tapping one shows the definition.

TEXT FORMATTING (inside any Markdown text)
- Formulas in LaTeX: inline $U = R \cdot I$, or a display formula on its own line: $$P = U \cdot I$$. Never put a formula in a code block.
- Diagrams as a Mermaid code block: ```mermaid then the diagram (flowchart, erDiagram, sequenceDiagram, timeline), then ```. Keep labels short; one diagram per idea.

LESSON
{ "id": "m1-l1", "title": "…", "goal": "What the learner can do afterwards", "blocks": [ Block ] }

BLOCKS

Text: { "id": "m1-l1-b1", "type": "text", "levels": { "normal": "…", "simple": "…", "detailed": "…" } }
  Two-language: also "i18n": { "de": { "normal": "…", "simple": "…", "detailed": "…" }, "en": { … } }

Callout: { "id": "m1-l1-b2", "type": "callout", "style": "keypoint", "markdown": "…" }
  "style" is one of: keypoint, tip, warning, note.

Example: { "id": "m1-l1-b3", "type": "example", "markdown": "Worked example with numbered steps" }

Image: { "id": "m1-l1-b4", "type": "image", "url": null, "searchTerm": "precise image search words", "alt": "…", "caption": "…" }
  "url" is ALWAYS null: you cannot know a real image URL.

Video: { "id": "m1-l1-b5", "type": "video", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "title": "Exact video title" }
  Only a real, existing English YouTube video. If you are not sure it exists, leave the block out.

Flashcards: { "id": "m1-l1-b6", "type": "flashcards", "cards": [ { "front": "cue", "back": "answer" } ] }

Quiz (last block of every lesson): { "id": "m1-l1-b7", "type": "quiz", "questions": [ Question ] }
Warm-up (optional, first block of a lesson): { "id": "m1-l1-b0", "type": "quiz", "pretest": true, "questions": [ Question ] }
  Guess-first questions before the lesson; they give feedback but do not count for mastery.

ModuleTest: { "id": "m1-test", "type": "module-test", "questions": [ Question ] }
FinalExam: { "id": "final-exam", "type": "final-exam", "questions": [ Question ] }

QUESTION (shared fields)
{
  "id": "q-m1-l1-1",
  "kind": "multiple-choice",
  "prompt": "…",
  "answer": 0,
  "explanation": "Why the answer is right and why the tempting wrong answer is wrong.",
  "hint": "A nudge, never the answer.",
  "hints": ["first nudge", "more specific", "almost the solution"],
  "rationales": ["why option 0 is right/wrong", "…"],
  "skillId": "m1-l1",
  "variantGroup": "m1-l1-key-idea"
}
"hints", "rationales", "skillId" and "variantGroup" are optional unless the instructions ask for them.

QUESTION KINDS
- multiple-choice: "options": [4 texts], "answer": index of the correct option (0-3).
- true-false: "answer": true or false.
- short-answer: "answer": ["accepted", "other accepted spelling"]. One word or very short term.
- fill-blank: "prompt" contains ___ where the gap is, "answer": ["accepted", …].
- numeric: "answer": 32, optional "tolerance": 0.5. Unit in the prompt, not in the answer.
- multi-select: "options": [texts], "answer": [indexes of ALL correct options].
- matching: "pairs": [ { "left": "…", "right": "…" } ] (2-6 pairs, correct pairs). No "answer".
- ordering: "items": [ "first", "second", … ] (2-6 items, in the CORRECT order). No "answer".
- written: "answer": "a model answer of 2-5 sentences", "points": ["key point 1", "key point 2", …] (2-6 short, checkable key points). The learner writes an answer, compares it with the model answer and ticks the points covered; two thirds are needed.
- hotspot: "svg": "<svg viewBox='0 0 400 240' xmlns='http://www.w3.org/2000/svg'>…</svg>" (a clear diagram: shapes, lines and short <text> labels, no scripts, no images, no links), "alt": "what the picture shows", "areas": [ { "x": 10, "y": 20, "w": 15, "h": 12, "label": "what this part is" } ] (2-8 areas in PERCENT of the picture's width and height), "answer": index of the area to tap. Do not write the answer as a label inside the picture.
