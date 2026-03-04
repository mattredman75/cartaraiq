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
  };
};

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
    const widgetItems = items
      .filter((i) => i.checked !== 2) // exclude soft-deleted
      .map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity ?? 1,
        unit: i.unit ?? null,
        checked: i.checked,
      }));

    await SharedDataModule.syncToWidget(list?.name ?? 'My List', widgetItems);
  } catch (e) {
    // Non-fatal — widget just shows stale data
    console.warn('[useWidgetSync] sync failed:', e);
  }
}
