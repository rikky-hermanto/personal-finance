import type { UnseenCompletion } from '@/types/Journey';

export interface ToastPlan {
  messages: string[]; // at most `max` titles, plus one "+N more" line
  ids: number[]; // every pending id, including the ones summarised as "+N more"
}

export const planCompletionToasts = (
  unseen: UnseenCompletion[],
  announced: ReadonlySet<number>,
  max = 2,
): ToastPlan => {
  const pending = unseen.filter((u) => u.ids.some((id) => !announced.has(id)));
  const messages = pending.slice(0, max).map((u) => u.title);
  if (pending.length > max) messages.push(`+${pending.length - max} more`);
  return { messages, ids: pending.flatMap((u) => u.ids.filter((id) => !announced.has(id))) };
};
