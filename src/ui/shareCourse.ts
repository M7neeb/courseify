// Sends a course to someone as a file: through the phone's share sheet (Messages, WhatsApp, Mail,
// AirDrop ...) where the browser allows it, otherwise as a download. The other person adds it with
// Import. Only the course travels, never your progress.

import { downloadJson } from '../core/download.ts';
import type { Course } from '../core/types.ts';

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareCourse(course: Course, text: string): Promise<ShareResult> {
  const name = `${course.id}.json`;
  const file = new File([JSON.stringify(course, null, 2)], name, { type: 'application/json' });
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: course.title, text });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
  }
  downloadJson(name, course);
  return 'downloaded';
}
