import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
}

interface ShoppingList {
  id: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
}

interface ListState {
  currentList: ShoppingList | null;
  setCurrentList: (list: ShoppingList | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  clearAuth: () => set({ token: null, user: null }),
}));

export const useListStore = create<ListState>((set) => ({
  currentList: null,
  setCurrentList: (list) => set({ currentList: list }),
}));
