import type { OutgoingMessage } from "./types";

const pending = new WeakMap<OutgoingMessage, () => void>();

export function registerDeliveryCommit(message: OutgoingMessage, commit: () => void): void {
  pending.set(message, commit);
}

export function commitDeliveredMessage(message: OutgoingMessage): boolean {
  const commit = pending.get(message);
  if (!commit) return false;
  pending.delete(message);
  commit();
  return true;
}
