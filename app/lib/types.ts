export interface ListItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
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
