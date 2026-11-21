<script lang="ts">
  // The lesson sidebar: the course, the current unit, that unit's lessons (with
  // a check once done and a lock when gated), its practice skills with their mastery squares, and
  // the other units folded away. The exact gate requirement is explained in the lesson itself, so
  // the sidebar stays a clean list. Shown beside the player and inside the phone drawer.
  import { app, courseSettings, displayTitle, getCourse, navigate } from '../../core/state.svelte.ts';
  import { flattenCourse, lessonKind, type FlatItem } from '../../core/course-utils.ts';
  import { gateForItem, openGate, type Gate } from '../../core/gating.ts';
  import { courseSkills, isMasterable, skillPoints, skillTitle, tierForPoints } from '../../core/mastery.ts';
  import { courseAccent } from '../../core/home.ts';
  import MasteryIcon from '../../ui/MasteryIcon.svelte';
  import NavIcon from '../../ui/NavIcon.svelte';
  import { t } from '../../i18n/i18n.ts';

  let { courseId, lessonId }: { courseId: string; lessonId?: string } = $props();

  const course = $derived(getCourse(courseId));
  const items = $derived(course ? flattenCourse(course) : []);
  const progress = $derived(app.progress[courseId]);
  const completed = $derived(new Set(progress?.completedLessons ?? []));
  const mastery = $derived(app.mastery[courseId]);
  const current = $derived(
    items.find((i) => i.id === lessonId) ??
      items.find((i) => i.id === progress?.position?.lessonId) ??
      items.find((i) => !completed.has(i.id)) ??
      items[0]
  );
  const unit = $derived(course?.modules.find((m) => m.id === current?.moduleId));
  const unitNumber = $derived(course && unit ? course.modules.indexOf(unit) + 1 : 0);
  // The current unit's items, or the final exam on its own when that is what's open.
  const unitItems = $derived(current?.moduleId ? items.filter((i) => i.moduleId === current.moduleId) : current ? [current] : []);
  const skills = $derived(
    course && unit
      ? courseSkills(course).filter((s) => s.moduleId === unit.id && isMasterable(s))
      : []
  );

  function gateOf(item: FlatItem): Gate {
    return course ? gateForItem(course, mastery, item, courseSettings(courseId).gatingMode) : openGate();
  }

  function itemTitle(item: FlatItem): string {
    if (item.kind === 'test') return t('mastery.legend.test');
    if (item.kind === 'exam') return t('exam.final');
    return item.title;
  }

  function iconFor(item: FlatItem): string {
    if (item.kind !== 'lesson' || !unit) return 'exercise';
    const lesson = unit.lessons.find((l) => l.id === item.id);
    const kind = lesson ? lessonKind(lesson) : 'article';
    return kind === 'video' ? 'play' : kind === 'exercise' ? 'exercise' : 'article';
  }

  function go(id: string) {
    navigate({ name: 'player', courseId, lessonId: id });
    window.scrollTo({ top: 0 });
  }

  function openUnit(moduleId: string) {
    navigate({ name: 'unit', courseId, moduleId });
    window.scrollTo({ top: 0 });
  }

  function practise(skillId: string) {
    navigate({ name: 'exercise', courseId, skillId });
    window.scrollTo({ top: 0 });
  }
</script>

{#if course}
  <nav class="cf-outline" aria-label={t('player.contents')}>
    <div class="cf-outline-course">
      <span class="cf-course-dot cf-course-dot-small" style:background={courseAccent(course.id)} aria-hidden="true"></span>
      <span class="cf-outline-course-title">{displayTitle(course)}</span>
    </div>

    {#if unit}
      <button type="button" class="cf-outline-unit" onclick={() => openUnit(unit.id)}>
        <span class="cf-unit-number">{t('unit.label', { n: unitNumber })}</span>
        <span class="cf-outline-unit-title">{unit.title}</span>
      </button>
    {/if}

    <ol class="cf-outline-items">
      {#each unitItems as item (item.id)}
        {@const gate = gateOf(item)}
        {@const done = completed.has(item.id)}
        <li>
          <button
            type="button"
            class:active={item.id === current?.id}
            class:locked={gate.locked}
            aria-current={item.id === current?.id ? 'page' : undefined}
            onclick={() => go(item.id)}
          >
            <span class="cf-outline-icon" class:done aria-hidden="true">
              <NavIcon name={gate.locked ? 'lock' : done ? 'check' : iconFor(item)} size={14} />
            </span>
            <span class="cf-outline-label">{itemTitle(item)}</span>
            {#if done}<span class="sr-only">{t('player.completed')}</span>{/if}
            {#if gate.locked}<span class="sr-only">{t('gate.locked')}</span>{/if}
          </button>
        </li>
      {/each}
    </ol>

    {#if skills.length > 0}
      <p class="cf-outline-sub">{t('unit.practice')}</p>
      <ul class="cf-outline-items">
        {#each skills as skill (skill.id)}
          {@const tier = tierForPoints(skillPoints(mastery, skill.id))}
          <li>
            <button type="button" onclick={() => practise(skill.id)}>
              <MasteryIcon {tier} size={18} />
              <span class="cf-outline-label">{skill.title ?? skillTitle(course, skill.id)}</span>
              <span class="sr-only">{t('mastery.tier.' + tier)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if course.modules.length > 1}
      <details class="cf-outline-more">
        <summary>{t('unit.courseUnits')}</summary>
        <ol>
          {#each course.modules as other, index (other.id)}
            <li>
              <button type="button" class:active={other.id === unit?.id} onclick={() => openUnit(other.id)}>
                <span class="cf-unit-number">{t('unit.label', { n: index + 1 })}</span>
                <span>{other.title}</span>
              </button>
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  </nav>
{/if}
