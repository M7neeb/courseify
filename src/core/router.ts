import type { Route } from './types.ts';

export function formatHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/home';
    case 'library':
      return '#/library';
    case 'import':
      return '#/import';
    case 'prompt':
      return '#/prompt';
    case 'settings':
      return route.courseId ? `#/settings/${encodeURIComponent(route.courseId)}` : '#/settings';
    case 'profile':
      return '#/profile';
    case 'stats':
      return '#/stats';
    case 'review':
      return '#/review';
    case 'play':
      return '#/play';
    case 'trash':
      return '#/trash';
    case 'exercise':
      return `#/exercise/${encodeURIComponent(route.courseId)}/${encodeURIComponent(route.skillId)}`;
    case 'challenge':
      return `#/challenge/${encodeURIComponent(route.courseId)}`;
    case 'unit':
      return `#/unit/${encodeURIComponent(route.courseId)}/${encodeURIComponent(route.moduleId)}`;
    case 'player': {
      const base = `#/course/${encodeURIComponent(route.courseId)}`;
      return route.lessonId ? `${base}/${encodeURIComponent(route.lessonId)}` : base;
    }
  }
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first, second, third] = parts;
  // 'dashboard' is the route this screen used to live at; keep old links working.
  if (first === 'home' || first === 'dashboard') return { name: 'home' };
  if (first === 'library') return { name: 'library' };
  if (first === 'import') return { name: 'import' };
  if (first === 'prompt') return { name: 'prompt' };
  if (first === 'settings') return second ? { name: 'settings', courseId: decodeURIComponent(second) } : { name: 'settings' };
  if (first === 'profile') return { name: 'profile' };
  if (first === 'stats') return { name: 'stats' };
  if (first === 'review') return { name: 'review' };
  if (first === 'trash') return { name: 'trash' };
  if (first === 'play') return { name: 'play' };
  if (first === 'exercise' && second && third) {
    return { name: 'exercise', courseId: decodeURIComponent(second), skillId: decodeURIComponent(third) };
  }
  if (first === 'challenge' && second) return { name: 'challenge', courseId: decodeURIComponent(second) };
  if (first === 'unit' && second && third) {
    return { name: 'unit', courseId: decodeURIComponent(second), moduleId: decodeURIComponent(third) };
  }
  if (first === 'course' && second) {
    const courseId = decodeURIComponent(second);
    return third ? { name: 'player', courseId, lessonId: decodeURIComponent(third) } : { name: 'player', courseId };
  }
  return { name: 'home' };
}
