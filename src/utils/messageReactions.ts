import type { MessageReaction } from 'src/types/chat';

function normalizeEventId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function isMessageReaction(value: unknown): value is MessageReaction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MessageReaction>;
  return (
    typeof candidate.emoji === 'string' &&
    candidate.emoji.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.reactorPublicKey === 'string' &&
    candidate.reactorPublicKey.trim().length > 0 &&
    (candidate.eventId === undefined ||
      candidate.eventId === null ||
      (typeof candidate.eventId === 'string' && candidate.eventId.trim().length > 0))
  );
}

export function normalizeMessageReactions(value: unknown): MessageReaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isMessageReaction)
    .map((reaction) => ({
      emoji: reaction.emoji.trim(),
      name: reaction.name.trim(),
      reactorPublicKey: reaction.reactorPublicKey.trim().toLowerCase(),
      ...(normalizeEventId(reaction.eventId) ? { eventId: normalizeEventId(reaction.eventId) } : {})
    }));
}

export function areMessageReactionsEqual(
  first: MessageReaction,
  second: MessageReaction
): boolean {
  return (
    first.emoji === second.emoji &&
    first.name === second.name &&
    first.reactorPublicKey === second.reactorPublicKey &&
    normalizeEventId(first.eventId) === normalizeEventId(second.eventId)
  );
}

export function buildMetaWithReactions(
  meta: Record<string, unknown>,
  reactions: MessageReaction[]
): Record<string, unknown> {
  const nextMeta = { ...meta };

  if (reactions.length === 0) {
    delete nextMeta.reactions;
    return nextMeta;
  }

  nextMeta.reactions = reactions.map((reaction) => ({ ...reaction }));
  return nextMeta;
}
