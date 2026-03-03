import { useMutation, QueryClient } from "@tanstack/react-query";
import {
  createShoppingList,
  deleteShoppingList,
  renameShoppingList,
} from "../lib/api";
import type { ShoppingList } from "../lib/types";

interface UseListMutationsArgs {
  qc: QueryClient;
  setCurrentList: (list: ShoppingList | null) => void;
  currentList: ShoppingList | null;
}

export function useListMutations({
  qc,
  setCurrentList,
  currentList,
}: UseListMutationsArgs) {
  const createListMutation = useMutation({
    mutationFn: (name: string) => createShoppingList(name),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["shoppingLists"] });
      setCurrentList(res.data);
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => deleteShoppingList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shoppingLists"] }),
  });

  const renameListMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameShoppingList(id, name),
    onMutate: ({ id, name }) => {
      qc.setQueryData<ShoppingList[]>(["shoppingLists"], (old = []) =>
        old.map((l) => (l.id === id ? { ...l, name } : l)),
      );
      if (currentList?.id === id) setCurrentList({ ...currentList, name });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["shoppingLists"] }),
  });

  return { createListMutation, deleteListMutation, renameListMutation };
}
