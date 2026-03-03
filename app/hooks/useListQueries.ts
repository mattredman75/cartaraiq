import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchListItems,
  fetchDeletedItems,
  fetchSuggestions,
  fetchRecipeSuggestions,
  fetchShoppingLists,
} from "../lib/api";
import type { ListItem, Suggestion, ShoppingList } from "../lib/types";

interface UseListQueriesArgs {
  listId: string | undefined;
  aiEnabled: boolean;
  pairingEnabled: boolean;
  dismissedUntil: Record<string, number>;
  userId: string | undefined;
}

export function useListQueries({
  listId,
  aiEnabled,
  pairingEnabled,
  dismissedUntil,
}: UseListQueriesArgs) {
  const { data: shoppingLists = [] as ShoppingList[], refetch: refetchLists } =
    useQuery<ShoppingList[]>({
      queryKey: ["shoppingLists"],
      queryFn: () => fetchShoppingLists().then((r) => r.data),
    });

  const {
    data: items = [],
    isLoading,
    refetch,
  } = useQuery<ListItem[]>({
    queryKey: ["listItems", listId],
    queryFn: () => fetchListItems(listId).then((r) => r.data),
    enabled: !!listId,
  });

  const { data: rawSuggestions = [], isFetching: suggestionsFetching } =
    useQuery<Suggestion[]>({
      queryKey: ["suggestions", listId],
      queryFn: () => fetchSuggestions(listId).then((r) => r.data),
      enabled: !!listId && aiEnabled,
      staleTime: 1000 * 60 * 5,
    });

  const {
    data: rawRecipeSuggestions = [],
    isFetching: recipeSuggestionsFetching,
  } = useQuery<Suggestion[]>({
    queryKey: ["recipeSuggestions", listId],
    queryFn: () => fetchRecipeSuggestions(listId).then((r) => r.data),
    enabled: !!listId && aiEnabled && pairingEnabled,
    staleTime: 1000 * 60 * 30,
  });

  const { data: deletedItems = [] } = useQuery<ListItem[]>({
    queryKey: ["deletedItems", listId],
    queryFn: () => fetchDeletedItems(listId).then((r) => r.data),
    enabled: !!listId,
    staleTime: 1000 * 60,
  });

  const unchecked = React.useMemo(
    () => items.filter((i) => i.checked === 0),
    [items],
  );

  const checked = React.useMemo(
    () => items.filter((i) => i.checked === 1),
    [items],
  );

  // Filter out dismissed suggestions and items already on the list
  const suggestions = aiEnabled
    ? rawSuggestions.filter(
        (s) =>
          !(dismissedUntil[s.name] && dismissedUntil[s.name] > Date.now()) &&
          !unchecked.some(
            (it) => it.name.toLowerCase() === s.name.toLowerCase(),
          ),
      )
    : [];

  // Filter recipe suggestions: exclude dismissed and items already on list
  const recipeSuggestions =
    aiEnabled && pairingEnabled
      ? rawRecipeSuggestions.filter(
          (s) =>
            !(dismissedUntil[s.name] && dismissedUntil[s.name] > Date.now()) &&
            !unchecked.some(
              (it) => it.name.toLowerCase() === s.name.toLowerCase(),
            ),
        )
      : [];

  // Combined suggestion strip (AI first, then pairing)
  const allSuggestions = [
    ...suggestions.map((s) => ({ ...s, _type: "ai" as const })),
    ...recipeSuggestions.map((s) => ({ ...s, _type: "recipe" as const })),
  ];

  return {
    shoppingLists,
    refetchLists,
    items,
    isLoading,
    refetch,
    deletedItems,
    unchecked,
    checked,
    suggestions,
    recipeSuggestions,
    allSuggestions,
    suggestionsFetching,
    recipeSuggestionsFetching,
  };
}
