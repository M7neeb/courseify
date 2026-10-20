<script lang="ts">
  // Create a course (M3). A six-step form turns into the prompts in core/promptBuilder.ts: an outline
  // (or the whole course in one reply), then one prompt per unit and the final exam under "Continue
  // a course", plus the repair prompt under "Fix a reply". Settings are remembered on this device,
  // and the settings a course was planned with are kept per course id so its unit prompts match.
  import schema from '../../prompts/schema.md?raw';
  import { app, displayTitle, navigate } from '../../core/state.svelte.ts';
  import {
    ALL_KINDS,
    BILINGUAL_LANGUAGES,
    LANGUAGES,
    applyPreset,
    courseIdFor,
    defaultSettings,
    checkPrompt,
    finalExamPrompt,
    fixPrompt,
    normalizeSettings,
    outlinePrompt,
    singlePrompt,
    toolTipKeys,
    unitPrompt,
    unitStatus,
    type Extras,
    type Preset,
    type PromptSettings
  } from '../../core/promptBuilder.ts';
  import { copyText } from '../../ui/clipboard.ts';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  const STORE_KEY = 'course-app:create';
  const courseKey = (id: string) => `course-app:create:${id}`;

  function load(key: string): PromptSettings | undefined {
    try {
      const raw = localStorage.getItem(key);
      return raw ? normalizeSettings(JSON.parse(raw)) : undefined;
    } catch {
      return undefined;
    }
  }

  function save(key: string, value: PromptSettings) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or full storage: settings simply are not remembered */
    }
  }

  type Mode = 'new' | 'continue' | 'fix';
  const STEPS = ['goal', 'material', 'languages', 'structure', 'practice', 'extras'] as const;
  type Step = (typeof STEPS)[number];
  const PRESET_LIST: Preset[] = ['exam', 'programming', 'understand', 'chess', 'refresher', 'deep-dive', 'custom'];
  const EXTRA_KEYS: (keyof Extras)[] = ['examples', 'analogies', 'mistakes', 'examTips', 'summaries', 'flashcards', 'images', 'videos', 'code', 'warmup', 'reading', 'checkins', 'chess'];

  let mode = $state<Mode>('new');
  let step = $state<Step>('goal');
  let s = $state<PromptSettings>(load(STORE_KEY) ?? defaultSettings());
  let copiedKey = $state('');
  let fixErrors = $state('');
  let fixJson = $state('');

  // Remember the settings on this device whenever they change.
  $effect(() => {
    save(STORE_KEY, $state.snapshot(s) as PromptSettings);
  });

  const stepIndex = $derived(STEPS.indexOf(step));
  const subjects = $derived([...new Set(app.courses.map((c) => (c.subject ?? '').trim()).filter((x) => x !== ''))].sort());
  const mainPrompt = $derived(s.generation === 'single' ? singlePrompt(s, schema) : outlinePrompt(s));
  const ready = $derived(s.topic.trim() !== '');

  // ---- continue a course ----
  let courseId = $state('');
  const course = $derived(app.courses.find((c) => c.id === courseId) ?? app.courses[0]);
  const savedForCourse = $derived(course ? load(courseKey(course.id)) : undefined);
  const unitSettings = $derived(savedForCourse ?? s);
  const units = $derived(course ? unitStatus(course) : []);

  function choosePreset(preset: Preset) {
    s = applyPreset(s, preset);
  }

  function setLanguageMode(value: 'single' | 'bilingual') {
    s.languageMode = value;
    if (value === 'bilingual' && !(BILINGUAL_LANGUAGES as readonly string[]).includes(s.primaryLanguage)) s.primaryLanguage = 'de';
    if (value === 'bilingual') s.secondLanguage = s.primaryLanguage === 'de' ? 'en' : 'de';
  }

  function setPrimary(value: string) {
    s.primaryLanguage = value;
    if (s.languageMode === 'bilingual') s.secondLanguage = value === 'de' ? 'en' : 'de';
  }

  function toggleKind(kind: (typeof ALL_KINDS)[number]) {
    const has = s.kinds.includes(kind);
    if (has && s.kinds.length === 1) return; // keep at least one type
    s.kinds = has ? s.kinds.filter((k) => k !== kind) : ALL_KINDS.filter((k) => k === kind || s.kinds.includes(k));
  }

  async function copy(key: string, text: string) {
    if (await copyText(text)) {
      copiedKey = key;
      setTimeout(() => {
        if (copiedKey === key) copiedKey = '';
      }, 2000);
    }
  }

  function copyMain() {
    // The unit prompts later must match how the course was planned.
    save(courseKey(courseIdFor(s.topic)), $state.snapshot(s) as PromptSettings);
    void copy('main', mainPrompt);
  }

  function go(delta: number) {
    const next = STEPS[stepIndex + delta];
    if (next) step = next;
    window.scrollTo({ top: 0 });
  }

  function clampNumber(value: number, min: number, max: number): number {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
  }
</script>

<section class="cf-create">
  <div class="cf-section-head">
    <div>
      <h1>{t('create.title')}</h1>
      <p class="cf-muted">{t('create.intro')}</p>
    </div>
  </div>

  <div class="cf-segmented cf-create-modes" role="group" aria-label={t('create.mode.label')}>
    {#each ['new', 'continue', 'fix'] as const as m (m)}
      <button type="button" aria-pressed={mode === m} onclick={() => (mode = m)}>{t('create.mode.' + m)}</button>
    {/each}
  </div>

  {#if mode === 'new'}
    <ol class="cf-stepper" aria-label={t('create.steps')}>
      {#each STEPS as name, i (name)}
        <li>
          <button type="button" class:active={step === name} class:done={i < stepIndex} aria-current={step === name ? 'step' : undefined} onclick={() => (step = name)}>
            <span class="cf-step-num">{#if i < stepIndex}<NavIcon name="check" size={14} />{:else}{i + 1}{/if}</span>
            <span>{t('create.step.' + name)}</span>
          </button>
        </li>
      {/each}
    </ol>

    <div class="cf-create-layout">
      <div class="cf-create-form">
        {#if step === 'goal'}
          <fieldset class="cf-fieldset">
            <legend>{t('create.preset.label')}</legend>
            <div class="cf-preset-grid">
              {#each PRESET_LIST as preset (preset)}
                <button type="button" class="cf-preset" aria-pressed={s.preset === preset} onclick={() => choosePreset(preset)}>
                  <span class="cf-preset-title">{t('create.preset.' + preset)}</span>
                  <span class="cf-preset-desc">{t('create.preset.' + preset + 'Desc')}</span>
                </button>
              {/each}
            </div>
          </fieldset>

          <div class="cf-field-grid">
            <label class="cf-field cf-wide">{t('create.topic')}
              <input id="create-topic" type="text" bind:value={s.topic} placeholder={t('create.topicHint')} />
            </label>
            <label class="cf-field">{t('create.subject')}
              <input id="create-subject" type="text" bind:value={s.subject} placeholder={t('create.subjectHint')} list="known-subjects" />
              <span class="cf-help">{t('create.subjectHelp')}</span>
            </label>
            <datalist id="known-subjects">{#each subjects as subject (subject)}<option value={subject}></option>{/each}</datalist>
            <label class="cf-field">{t('create.purpose')}
              <select bind:value={s.purpose}>
                {#each ['exam', 'understand', 'skill', 'interest'] as const as p (p)}<option value={p}>{t('create.purpose.' + p)}</option>{/each}
              </select>
            </label>
          </div>

          <fieldset class="cf-fieldset">
            <legend>{t('create.level')}</legend>
            <div class="cf-choice-row">
              {#each ['beginner', 'some', 'intermediate', 'advanced'] as const as level (level)}
                <label class="cf-choice"><input type="radio" name="level" value={level} bind:group={s.level} />{t('create.level.' + level)}</label>
              {/each}
            </div>
          </fieldset>

          <div class="cf-field-grid">
            <label class="cf-field">{t('create.prior')}
              <input type="text" bind:value={s.priorKnowledge} placeholder={t('create.priorHint')} />
            </label>
            <label class="cf-field">{t('create.context')}
              <input type="text" bind:value={s.context} placeholder={t('create.contextHint')} />
            </label>
            {#if s.purpose === 'exam'}
              <label class="cf-field cf-wide">{t('create.exam')}
                <input type="text" bind:value={s.examDetails} placeholder={t('create.examHint')} />
              </label>
            {/if}
          </div>
        {:else if step === 'material'}
          <fieldset class="cf-fieldset">
            <legend>{t('create.source')}</legend>
            {#each ['pasted', 'attached', 'none'] as const as mode (mode)}
              <label class="cf-choice cf-choice-block"><input type="radio" name="source" value={mode} bind:group={s.sourceMode} />{t('create.source.' + mode)}</label>
            {/each}
          </fieldset>

          {#if s.sourceMode === 'pasted'}
            <label class="cf-field">{t('create.material')}
              <textarea rows="12" bind:value={s.material}></textarea>
              <span class="cf-help">{t('create.materialCount', { n: s.material.length.toLocaleString(app.settings.uiLanguage) })}</span>
            </label>
            {#if s.material.length > 30000}<p class="cf-recommend">{t('create.materialLong')}</p>{/if}
          {:else if s.sourceMode === 'attached'}
            <p class="cf-recommend">{t('create.attachedHelp')}</p>
          {/if}

          {#if s.sourceMode !== 'none'}
            <fieldset class="cf-fieldset">
              <legend>{t('create.strictness')}</legend>
              {#each ['mainly', 'only'] as const as strictness (strictness)}
                <label class="cf-choice cf-choice-block"><input type="radio" name="strict" value={strictness} bind:group={s.strictness} />{t('create.strict.' + strictness)}</label>
              {/each}
              <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.citeSources} />{t('create.cite')}</label>
            </fieldset>
          {/if}
        {:else if step === 'languages'}
          <fieldset class="cf-fieldset">
            <legend>{t('create.langMode')}</legend>
            {#each ['bilingual', 'single'] as const as value (value)}
              <label class="cf-choice cf-choice-block">
                <input type="radio" name="langmode" checked={s.languageMode === value} onchange={() => setLanguageMode(value)} />{t('create.lang.' + value)}
              </label>
            {/each}
          </fieldset>
          <div class="cf-field-grid">
            <label class="cf-field">{s.languageMode === 'bilingual' ? t('create.primaryBilingual') : t('create.primary')}
              <select value={s.primaryLanguage} onchange={(e) => setPrimary(e.currentTarget.value)}>
                {#each s.languageMode === 'bilingual' ? BILINGUAL_LANGUAGES : Object.keys(LANGUAGES) as code (code)}
                  <option value={code}>{LANGUAGES[code]}</option>
                {/each}
              </select>
            </label>
          </div>
          {#if s.languageMode === 'bilingual'}<p class="cf-recommend">{t('create.bilingualNote')}</p>{/if}
          {#if s.languageMode === 'bilingual' || s.primaryLanguage !== 'en'}
            <fieldset class="cf-fieldset">
              <legend>{t('create.terms')}</legend>
              {#each ['primary', 'both', 'english'] as const as terms (terms)}
                <label class="cf-choice cf-choice-block"><input type="radio" name="terms" value={terms} bind:group={s.termsLanguage} />{t('create.terms.' + terms)}</label>
              {/each}
            </fieldset>
          {/if}
        {:else if step === 'structure'}
          <fieldset class="cf-fieldset">
            <legend>{t('create.generation')}</legend>
            {#each ['stepwise', 'single'] as const as gen (gen)}
              <label class="cf-choice cf-choice-block"><input type="radio" name="gen" value={gen} bind:group={s.generation} />{t('create.gen.' + gen)}</label>
            {/each}
          </fieldset>
          <fieldset class="cf-fieldset">
            <legend>{t('create.size')}</legend>
            <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.autoSize} />{t('create.autoSize')}</label>
            {#if !s.autoSize}
              <div class="cf-field-grid">
                <label class="cf-field">{t('create.modules')}
                  <input type="number" min="1" max="15" value={s.modules} onchange={(e) => (s.modules = clampNumber(e.currentTarget.valueAsNumber, 1, 15))} />
                </label>
                <label class="cf-field">{t('create.lessons')}
                  <input type="number" min="1" max="8" value={s.lessonsPerModule} onchange={(e) => (s.lessonsPerModule = clampNumber(e.currentTarget.valueAsNumber, 1, 8))} />
                </label>
              </div>
            {/if}
          </fieldset>
          <fieldset class="cf-fieldset">
            <legend>{t('create.depth')}</legend>
            <div class="cf-choice-row">
              {#each ['short', 'standard', 'thorough'] as const as depth (depth)}
                <label class="cf-choice"><input type="radio" name="depth" value={depth} bind:group={s.depth} />{t('create.depth.' + depth)}</label>
              {/each}
            </div>
            <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.threeLevels} />{t('create.threeLevels')}</label>
          </fieldset>
        {:else if step === 'practice'}
          <div class="cf-field-grid">
            <label class="cf-field">{t('create.questions')}
              <input type="number" min="2" max="12" value={s.questionsPerLesson} onchange={(e) => (s.questionsPerLesson = clampNumber(e.currentTarget.valueAsNumber, 2, 12))} />
            </label>
            <label class="cf-field">{t('create.testQuestions')}
              <input type="number" min="3" max="25" value={s.testQuestions} onchange={(e) => (s.testQuestions = clampNumber(e.currentTarget.valueAsNumber, 3, 25))} />
            </label>
            <label class="cf-field">{t('create.difficulty')}
              <select bind:value={s.difficulty}>
                {#each ['gentle', 'moderate', 'challenging', 'mixed', 'exam'] as const as d (d)}<option value={d}>{t('create.diff.' + d)}</option>{/each}
              </select>
            </label>
          </div>
          <fieldset class="cf-fieldset">
            <legend>{t('create.kinds')}</legend>
            <div class="cf-check-grid">
              {#each ALL_KINDS as kind (kind)}
                <label class="cf-choice"><input type="checkbox" checked={s.kinds.includes(kind)} onchange={() => toggleKind(kind)} />{t('create.kind.' + kind)}</label>
              {/each}
            </div>
          </fieldset>
          <fieldset class="cf-fieldset">
            <legend>{t('unit.practice')}</legend>
            <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.progressiveHints} />{t('create.hints')}</label>
            <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.variants} />{t('create.variants')}</label>
            {#if s.purpose === 'exam'}
              <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.examOperators} />{t('create.operators')}</label>
            {/if}
            <label class="cf-choice cf-choice-block"><input type="checkbox" bind:checked={s.finalExam} />{t('create.finalExam')}</label>
            {#if s.finalExam}
              <label class="cf-field cf-indent">{t('create.finalExamQuestions')}
                <input type="number" min="5" max="40" value={s.finalExamQuestions} onchange={(e) => (s.finalExamQuestions = clampNumber(e.currentTarget.valueAsNumber, 5, 40))} />
              </label>
            {/if}
          </fieldset>
        {:else}
          <fieldset class="cf-fieldset">
            <legend>{t('create.extras')}</legend>
            <div class="cf-check-grid">
              {#each EXTRA_KEYS as key (key)}
                <label class="cf-choice"><input type="checkbox" bind:checked={s.extras[key]} />{t('create.extra.' + key)}</label>
              {/each}
            </div>
          </fieldset>
          <div class="cf-field-grid">
            <label class="cf-field">{t('create.tone')}
              <input type="text" bind:value={s.tone} placeholder={t('create.toneHint')} />
            </label>
            <label class="cf-field">{t('create.tool')}
              <select bind:value={s.tool}>
                {#each ['chatgpt', 'claude', 'gemini', 'deepseek', 'other'] as const as tool (tool)}<option value={tool}>{t('create.tool.' + tool)}</option>{/each}
              </select>
            </label>
            <label class="cf-field cf-wide">{t('create.extra')}
              <textarea rows="4" bind:value={s.extraInstructions} placeholder={t('create.extraHint')}></textarea>
            </label>
          </div>
        {/if}

        <div class="cf-step-nav">
          {#if stepIndex > 0}<button type="button" class="cf-btn cf-btn-secondary" onclick={() => go(-1)}>{t('create.back')}</button>{/if}
          <span class="cf-lesson-nav-spacer"></span>
          {#if stepIndex < STEPS.length - 1}<button type="button" class="cf-btn cf-btn-primary" onclick={() => go(1)}>{t('create.next')}</button>{/if}
        </div>
      </div>

      <aside class="cf-prompt-panel" aria-label={t('create.prompt')}>
        <p class="cf-stat-label">{t('create.prompt')}</p>
        <h2>{s.generation === 'single' ? t('create.prompt.single') : t('create.prompt.outline')}</h2>
        {#if ready}
          <button type="button" class="cf-btn cf-btn-primary cf-btn-full" onclick={copyMain}>
            {copiedKey === 'main' ? t('create.copied') : t('create.copy')}
          </button>
          <p class="cf-muted cf-small">{t('create.chars', { n: mainPrompt.length.toLocaleString(app.settings.uiLanguage) })}</p>
        {:else}
          <p class="cf-recommend">{t('create.needTopic')}</p>
        {/if}

        <h3>{t('create.how')}</h3>
        <ol class="cf-how">
          <li>{t('create.how.1')}</li>
          <li>{t(s.sourceMode === 'attached' ? 'create.how.2attached' : 'create.how.2', { tool: t('create.tool.' + s.tool) })}</li>
          <li>{t('create.how.3')}</li>
          <li>{t('create.how.4')} <button type="button" class="cf-link" onclick={() => navigate({ name: 'import' })}>{t('create.toImport')}</button></li>
          {#if s.generation === 'stepwise'}<li>{t('create.how.5')}</li>{/if}
        </ol>

        <h3>{t('create.tips')}</h3>
        <ul class="cf-tips">
          {#each toolTipKeys(s.tool) as key (key)}<li>{t(key)}</li>{/each}
        </ul>

        {#if ready}
          <details class="cf-prompt-preview">
            <summary>{t('create.show')}</summary>
            <pre>{mainPrompt}</pre>
          </details>
        {/if}
      </aside>
    </div>
  {:else if mode === 'continue'}
    {#if app.courses.length === 0}
      <p class="cf-card">{t('create.continue.none')}</p>
    {:else}
      <div class="cf-field-grid">
        <label class="cf-field">{t('create.continue.pick')}
          <select value={course?.id ?? ''} onchange={(e) => (courseId = e.currentTarget.value)}>
            {#each app.courses as c (c.id)}<option value={c.id}>{displayTitle(c)}</option>{/each}
          </select>
        </label>
      </div>
      <p class="cf-muted cf-small">{savedForCourse ? t('create.savedSettings') : t('create.currentSettings')} {t('create.continue.help')}</p>
      <p class="cf-muted cf-small">{t('create.checkHelp')}</p>

      {#if course}
        <ul class="cf-unit-prompts">
          {#each units as unit, index (unit.moduleId)}
            <li>
              <span class="cf-outline-icon" class:done={unit.written} aria-hidden="true"><NavIcon name={unit.written ? 'check' : 'article'} size={14} /></span>
              <div class="cf-unit-prompt-text">
                <span class="cf-practice-title">{t('unit.heading', { n: index + 1, title: unit.title })}</span>
                <span class="cf-muted cf-small">{unit.written ? t('create.unitWritten') : t('create.unitEmpty')}</span>
              </div>
              <div class="cf-unit-prompt-actions">
                {#if unit.written}
                  <button
                    type="button"
                    class="cf-btn cf-btn-small cf-btn-secondary"
                    title={t('create.checkHint')}
                    onclick={() => course && copy('check-' + unit.moduleId, checkPrompt(course, unit.moduleId))}
                  >
                    {copiedKey === 'check-' + unit.moduleId ? t('create.copied') : t('create.check')}
                  </button>
                {/if}
                <button
                  type="button"
                  class="cf-btn cf-btn-small"
                  class:cf-btn-primary={!unit.written}
                  class:cf-btn-secondary={unit.written}
                  onclick={() => course && copy('unit-' + unit.moduleId, unitPrompt(unitSettings, course, unit.moduleId, schema))}
                >
                  {copiedKey === 'unit-' + unit.moduleId ? t('create.copied') : t('create.copyUnit')}
                </button>
              </div>
            </li>
          {/each}
          {#if unitSettings.finalExam}
            <li>
              <span class="cf-outline-icon" class:done={course.finalExam !== undefined} aria-hidden="true"><NavIcon name={course.finalExam ? 'check' : 'exercise'} size={14} /></span>
              <div class="cf-unit-prompt-text">
                <span class="cf-practice-title">{t('create.examRow')}</span>
                <span class="cf-muted cf-small">{course.finalExam ? t('create.examDone') : t('create.examReady')}</span>
              </div>
              <div class="cf-unit-prompt-actions">
                {#if course.finalExam}
                  <button
                    type="button"
                    class="cf-btn cf-btn-small cf-btn-secondary"
                    title={t('create.checkHint')}
                    onclick={() => course && copy('check-exam', checkPrompt(course, 'final-exam'))}
                  >
                    {copiedKey === 'check-exam' ? t('create.copied') : t('create.check')}
                  </button>
                {/if}
                <button type="button" class="cf-btn cf-btn-secondary cf-btn-small" onclick={() => course && copy('exam', finalExamPrompt(unitSettings, course, schema))}>
                  {copiedKey === 'exam' ? t('create.copied') : t('create.copyUnit')}
                </button>
              </div>
            </li>
          {/if}
        </ul>
        <div class="cf-actions">
          <button type="button" class="cf-btn cf-btn-secondary" onclick={() => navigate({ name: 'import' })}>{t('create.toImport')}</button>
        </div>
      {/if}
    {/if}
  {:else}
    <p class="cf-muted">{t('create.fix.hint')}</p>
    <div class="cf-field-grid">
      <label class="cf-field cf-wide">{t('create.fix.errors')}
        <textarea rows="5" bind:value={fixErrors}></textarea>
      </label>
      <label class="cf-field cf-wide">{t('create.fix.json')}
        <textarea rows="10" bind:value={fixJson}></textarea>
      </label>
    </div>
    <div class="cf-actions">
      <button type="button" class="cf-btn cf-btn-primary" disabled={fixErrors.trim() === '' || fixJson.trim() === ''} onclick={() => copy('fix', fixPrompt(fixErrors, fixJson))}>
        {copiedKey === 'fix' ? t('create.copied') : t('create.fix.copy')}
      </button>
    </div>
  {/if}
</section>
