Course JSON (schemaVersion 2). Every text field is Markdown unless noted.

LANGUAGE FIELDS
- One-language course: use the plain fields shown below (levels, markdown, prompt, options, ...). No "i18n".
- Two-language course: keep the plain fields as the first language's copy AND add "i18n": { "<lang>": { ...same fields... } } for every language, on every block and question that has text. Allowed i18n fields: text blocks "normal", "simple", "detailed"; callout/example "markdown"; image "alt", "caption"; flashcards "cards"; questions "prompt", "options", "answer", "explanation", "hint", "hints", "rationales", "pairs", "items".

COURSE
{ "schemaVersion": 2, "id": "course-id", "title": "…", "subject": "…", "level": "…", "language": "de", "languages": ["de"], "modules": [ Module ], "finalExam": FinalExam? }

MODULE (a unit)
{ "id": "m1", "title": "…", "summary": "1-2 sentences", "lessons": [ Lesson ], "test": ModuleTest }

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
