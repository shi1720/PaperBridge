export type ConversationMessage = {
  id: string;
  createdAt: number;
  authorId?: string;
  [key: string]: unknown;
};

/** A poll may have started before a send completed. Keep acknowledged messages. */
export function mergeConversationMessages<T extends ConversationMessage>(
  current: T[],
  incoming: T[],
): T[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(-500);
}

/** Full snapshots also remove messages deleted on the server. Only preserve sends
 * acknowledged after this request started, which may be missing from its view. */
export function reconcileConversationSnapshot<T extends ConversationMessage>(
  current: T[],
  incoming: T[],
  acknowledgedAfterPoll: ReadonlySet<string>,
): T[] {
  return mergeConversationMessages(
    current.filter((message) => acknowledgedAfterPoll.has(message.id)),
    incoming,
  );
}
