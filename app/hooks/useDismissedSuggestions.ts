import { useState, useEffect } from "react";
import { getItem, setItem } from "../lib/storage";

const DISMISS_DAYS = 7;

async function getDismissed(userId: string): Promise<Record<string, number>> {
  try {
    const raw = await getItem(`dismissed_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveDismissed(userId: string, map: Record<string, number>) {
  try {
    await setItem(`dismissed_${userId}`, JSON.stringify(map));
  } catch {}
}

export function useDismissedSuggestions(userId: string | undefined) {
  const [dismissedUntil, setDismissedUntil] = useState<Record<string, number>>(
    {},
  );

  // Load dismissed suggestions on mount, pruning expired ones
  useEffect(() => {
    if (userId) {
      getDismissed(userId).then((map) => {
        const now = Date.now();
        const pruned = Object.fromEntries(
          Object.entries(map).filter(([, until]) => until > now),
        );
        setDismissedUntil(pruned);
        saveDismissed(userId, pruned);
      });
    }
  }, [userId]);

  const dismissSuggestion = async (name: string) => {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    const updated = { ...dismissedUntil, [name]: until };
    setDismissedUntil(updated);
    if (userId) saveDismissed(userId, updated);
  };

  return { dismissedUntil, dismissSuggestion };
}
