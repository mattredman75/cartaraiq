import { NativeModules, Platform } from 'react-native';
import type { ListItem, ShoppingList } from '../lib/types';

const { SharedDataModule } = NativeModules as {
  SharedDataModule?: {
    syncToWidget: (
      listName: string,
      items: Array<{
        id: string;
        name: string;
        quantity: number;
        unit: string | null;
        checked: number;
      }>,
    ) => Promise<void>;
    syncAllListsToWidget: (
      lists: Array<{
        id: string;
        name: string;
        items: Array<{
          id: string;
          name: string;
          quantity: number;
          unit: string | null;
          checked: number;
        }>;
      }>,
    ) => Promise<void>;
  };
};

/** Format items for the widget (exclude soft-deleted) */
function formatItems(items: ListItem[]) {
  return items
    .filter((i) => i.checked !== 2)
    .map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity ?? 1,
      unit: i.unit ?? null,
      checked: i.checked,
    }));
}

/**
 * Syncs the current list to the iOS home-screen widget via App Group UserDefaults.
 * No-ops on Android or when the native module isn't available.
 */
export async function syncListToWidget(
  list: ShoppingList | null,
  items: ListItem[],
): Promise<void> {
  if (Platform.OS !== 'ios' || !SharedDataModule) return;

  try {
    await SharedDataModule.syncToWidget(list?.name ?? 'My List', formatItems(items));
  } catch (e) {
    // Non-fatal — widget just shows stale data
    console.warn('[useWidgetSync] sync failed:', e);
  }
}

/**
 * Syncs all lists (with items for the current list) to the widget.
 * The widget uses this for the list picker and to display items.
 * Items accumulate — each list's items are updated when the user views it.
 */
export async function syncAllListsToWidget(
  lists: ShoppingList[],
  currentList: ShoppingList | null,
  currentItems: ListItem[],
): Promise<void> {
  if (Platform.OS !== 'ios' || !SharedDataModule) return;

  try {
    const payload = lists.map((list) => ({
      id: list.id,
      name: list.name,
      // Only include items for the current list; other lists send
      // an empty array (the native side merges rather than overwrites).
      items: list.id === currentList?.id ? formatItems(currentItems) : [],
    }));

    await SharedDataModule.syncAllListsToWidget(payload);
  } catch (e) {
    console.warn('[useWidgetSync] syncAllLists failed:', e);
  }
}
