import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
}

interface ShoppingList {
  id: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  updateUser: (partial: Partial<User>) => void;
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
  updateUser: (partial) => set((state) => ({ user: state.user ? { ...state.user, ...partial } : null })),
  clearAuth: () => set({ token: null, user: null }),
}));

export const useListStore = create<ListState>((set) => ({
  currentList: null,
  setCurrentList: (list) => set({ currentList: list }),
}));
