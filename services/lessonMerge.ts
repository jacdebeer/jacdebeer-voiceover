import { LessonData } from './lessonPlayer';

/**
 * One lesson from several slides: the beats of every slide, in slide order, each tagged with its slide label so the player's
 * navigation shows where a slide starts. Pronunciations of all slides apply to the whole lesson.
 */
export function mergeLessons(
  items: { label: string; data: LessonData }[],
  opts: { title: string; subtitle?: string; brand?: boolean },
): LessonData {
  const first = items[0]?.data ?? {};
  const pronunciations: Record<string, string> = {};
  const beats: NonNullable<LessonData['beats']> = [];
  for (const it of items) {
    Object.assign(pronunciations, (it.data.pronunciations as Record<string, string> | undefined) ?? {});
    for (const b of it.data.beats ?? []) beats.push({ ...b, group: it.label });
  }
  const merged: LessonData = {
    lang: first.lang,
    icon: '🎓',
    title: opts.title,
    subtitle: opts.subtitle ?? '',
    currency: first.currency,
    labels: first.labels,
    scenario: first.scenario,
    mode: 'combined',
    brand: opts.brand,
    beats,
  };
  if (Object.keys(pronunciations).length) merged.pronunciations = pronunciations;
  return merged;
}

/** The audio of every slide in one map (a line that is spoken on two slides has the same clip). */
export function mergeAudio(list: Record<string, string>[]): Record<string, string> {
  return Object.assign({}, ...list);
}
