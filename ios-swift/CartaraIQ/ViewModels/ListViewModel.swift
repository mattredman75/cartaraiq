import Foundation
import Observation

@Observable
class ListViewModel {
    var items: [ListItem] = []
    var lists: [ShoppingList] = []
    var currentListId: String? = nil
    var suggestions: [Suggestion] = []
    var isLoading = false
    var isSuggestionsLoading = false
    var errorMessage: String? = nil

    // MARK: - Computed

    var activeItems: [ListItem] {
        items.filter { $0.isActive }
            .sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
    }

    var checkedItems: [ListItem] {
        items.filter { $0.isDone }
    }

    var deletedItems: [ListItem] {
        items.filter { $0.isDeleted }
    }

    var currentList: ShoppingList? {
        lists.first { $0.id == currentListId }
    }

    // MARK: - Load

    @MainActor
    func loadItems() async {
        isLoading = true
        errorMessage = nil
        do {
            items = try await fetchListItems(listId: currentListId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    func loadLists() async {
        do {
            lists = try await fetchShoppingLists()
            if currentListId == nil, let first = lists.first {
                currentListId = first.id
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func reload() async {
        await loadItems()
    }

    // MARK: - Add Item

    @MainActor
    func addItem(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        let wordCount = trimmed.split(separator: " ").count
        do {
            if wordCount <= 2 {
                let item = try await addListItem(name: trimmed, quantity: 1, listId: currentListId)
                items.insert(item, at: 0)
            } else {
                let newItems = try await parseAndAddItems(text: trimmed, listId: currentListId)
                items.insert(contentsOf: newItems.reversed(), at: 0)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Toggle

    @MainActor
    func toggleItem(_ item: ListItem) async {
        let newChecked = item.checked == 0 ? 1 : 0
        // Optimistic update
        if let idx = items.firstIndex(where: { $0.id == item.id }) {
            items[idx].checked = newChecked
        }
        do {
            let updated = try await updateListItem(id: item.id, checked: newChecked)
            if let idx = items.firstIndex(where: { $0.id == item.id }) {
                items[idx] = updated
            }
        } catch {
            // Revert on failure
            if let idx = items.firstIndex(where: { $0.id == item.id }) {
                items[idx].checked = item.checked
            }
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Delete (soft)

    @MainActor
    func deleteItem(_ item: ListItem) async {
        // Optimistic remove from view
        items.removeAll { $0.id == item.id }
        do {
            try await deleteListItem(id: item.id)
        } catch {
            items.append(item)
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Hard delete

    @MainActor
    func hardDeleteItem(_ item: ListItem) async {
        items.removeAll { $0.id == item.id }
        do {
            try await hardDeleteItem(id: item.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Restore

    @MainActor
    func restoreItem(_ item: ListItem) async {
        do {
            let updated = try await updateListItem(id: item.id, checked: 0)
            if let idx = items.firstIndex(where: { $0.id == item.id }) {
                items[idx] = updated
            } else {
                items.insert(updated, at: 0)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Reorder

    @MainActor
    func reorderItems(_ reordered: [ListItem]) async {
        // Apply reorder locally first
        let activeIds = Set(reordered.map { $0.id })
        let nonActive = items.filter { !activeIds.contains($0.id) }
        items = reordered + nonActive

        let reorderData = reordered.enumerated().map { (offset, item) in
            (id: item.id, sortOrder: offset + 1)
        }
        do {
            try await reorderListItems(reorderData)
        } catch {
            errorMessage = error.localizedDescription
            await loadItems()
        }
    }

    // MARK: - Rename

    @MainActor
    func renameItem(_ item: ListItem, to name: String) async {
        do {
            let updated = try await updateListItem(id: item.id, name: name)
            if let idx = items.firstIndex(where: { $0.id == item.id }) {
                items[idx] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Fix with AI

    @MainActor
    func fixWithAI(_ item: ListItem) async {
        do {
            let parsed = try await parseItemText(text: item.name, listId: currentListId)
            let existingNames = Set(
                activeItems.filter { $0.id != item.id }.map { $0.name.lowercased() }
            )
            let nonDuplicates = parsed.filter { !existingNames.contains($0.name.lowercased()) }

            if nonDuplicates.isEmpty {
                // All duplicates — hard delete
                try await hardDeleteItem(id: item.id)
                items.removeAll { $0.id == item.id }
            } else {
                // Rename original to first, add rest as new items
                let renamed = try await updateListItem(id: item.id, name: nonDuplicates[0].name)
                if let idx = items.firstIndex(where: { $0.id == item.id }) {
                    items[idx] = renamed
                }
                if nonDuplicates.count > 1 {
                    for extra in nonDuplicates.dropFirst() {
                        let newItem = try await addListItem(name: extra.name, quantity: 1, listId: currentListId)
                        items.insert(newItem, at: 0)
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Suggestions

    @MainActor
    func loadSuggestions(userId: String) async {
        guard AppStorageManager.shared.aiSuggestionsEnabled else {
            suggestions = []
            return
        }

        isSuggestionsLoading = true
        do {
            let activeNames = Set(activeItems.map { $0.name.lowercased() })

            async let aiRaw = fetchAISuggestions(listId: currentListId)
            async let recipeRaw = AppStorageManager.shared.pairingSuggestionsEnabled
                ? fetchRecipeSuggestions(listId: currentListId)
                : []

            let (ai, recipe) = try await (aiRaw, recipeRaw)

            let aiSuggestions = ai.map { Suggestion(name: $0.name, reason: $0.reason, type: .ai) }
            let recipeSuggestions = recipe.map { Suggestion(name: $0.name, reason: $0.reason, type: .recipe) }

            let all = aiSuggestions + recipeSuggestions
            suggestions = all.filter { s in
                !activeNames.contains(s.name.lowercased()) &&
                !AppStorageManager.shared.isDismissed(s.name, for: userId)
            }
        } catch {
            // Silently fail for suggestions
        }
        isSuggestionsLoading = false
    }

    func dismissSuggestion(_ suggestion: Suggestion, userId: String) {
        AppStorageManager.shared.dismissFor7Days(suggestion.name, userId: userId)
        suggestions.removeAll { $0.id == suggestion.id }
    }

    @MainActor
    func addSuggestion(_ suggestion: Suggestion) async {
        suggestions.removeAll { $0.id == suggestion.id }
        await addItem(suggestion.name)
    }

    // MARK: - List Management

    @MainActor
    func createList(name: String) async {
        do {
            let newList = try await createShoppingList(name: name)
            lists.append(newList)
            currentListId = newList.id
            await loadItems()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func renameList(_ list: ShoppingList, to name: String) async {
        do {
            let updated = try await renameShoppingList(id: list.id, name: name)
            if let idx = lists.firstIndex(where: { $0.id == list.id }) {
                lists[idx] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func deleteList(_ list: ShoppingList) async {
        do {
            try await deleteShoppingList(id: list.id)
            lists.removeAll { $0.id == list.id }
            if currentListId == list.id {
                currentListId = lists.first?.id
                await loadItems()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func switchToList(_ list: ShoppingList) async {
        currentListId = list.id
        await loadItems()
    }
}
