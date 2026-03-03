import { useMutation, QueryClient } from "@tanstack/react-query";
import { addListItem, parseAndAddItems, updateListItem } from "../lib/api";
import type { ListItem } from "../lib/types";

interface UseItemMutationsArgs {
  listId: string | undefined;
  qc: QueryClient;
}

export function useItemMutations({ listId, qc }: UseItemMutationsArgs) {
  const addMutation = useMutation({
    mutationFn: ({ text }: { text: string }) => {
      return addListItem(text.trim(), 1, listId);
      //const words = text.trim().split(/\s+/);
      ////return words.length <= 2
      //  ? addListItem(text.trim(), 1, listId)
      //  : parseAndAddItems(text, listId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
      qc.invalidateQueries({ queryKey: ["deletedItems", listId] });
      qc.invalidateQueries({ queryKey: ["suggestions", listId] });
      qc.invalidateQueries({ queryKey: ["recipeSuggestions", listId] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: number }) =>
      updateListItem(
        id,
        checked === 0 ? { checked, sort_order: 0 } : { checked },
      ),
    onMutate: ({ id, checked }) => {
      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) => {
        const updated = old.map((it) =>
          it.id === id
            ? { ...it, checked, sort_order: checked === 0 ? 0 : it.sort_order }
            : it,
        );
        if (checked === 0) {
          const item = updated.find((i) => i.id === id)!;
          return [item, ...updated.filter((i) => i.id !== id)];
        }
        return updated;
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["listItems", listId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => updateListItem(id, { checked: 2 }),
    onMutate: (id) => {
      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) =>
        old.filter((it) => it.id !== id),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["listItems", listId] });
      qc.invalidateQueries({ queryKey: ["deletedItems", listId] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateListItem(id, { name }),
    onMutate: ({ id, name }) => {
      qc.setQueryData<ListItem[]>(["listItems", listId], (old = []) =>
        old.map((it) => (it.id === id ? { ...it, name } : it)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["listItems", listId] }),
  });

  return { addMutation, toggleMutation, deleteMutation, renameMutation };
}
