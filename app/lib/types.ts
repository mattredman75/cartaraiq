export interface ListItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  checked: number; // 0=active, 1=done, 2=soft-deleted
  sort_order: number | null;
  times_added: number;
}

export interface Suggestion {
  name: string;
  reason: string;
}

export interface ShoppingList {
  id: string;
  name: string;
}
