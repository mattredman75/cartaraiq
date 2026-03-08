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

export interface StoreCard {
  id: string;
  barcode: string;
  name: string;
  color: string; // hex color code
  createdAt: string; // ISO date string
  programId?: string; // matches LoyaltyProgram.id from loyaltyPrograms.ts
}
