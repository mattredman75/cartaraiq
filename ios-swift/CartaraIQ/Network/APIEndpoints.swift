import Foundation

// MARK: - Request Bodies

private struct LoginBody: Encodable { let email: String; let password: String }
private struct RegisterBody: Encodable { let email: String; let password: String; let name: String }
private struct ForgotPasswordBody: Encodable { let email: String }
private struct ResetPasswordBody: Encodable { let email: String; let code: String; let newPassword: String }
private struct UpdateMeBody: Encodable { let name: String }
private struct AddItemBody: Encodable { let name: String; let quantity: Int; let listId: String? }
private struct BulkAddBody: Encodable { let text: String; let listId: String? }
private struct ParseTextBody: Encodable { let text: String; let listId: String? }
private struct UpdateItemBody: Encodable {
    let name: String?; let quantity: Int?; let checked: Int?; let sortOrder: Int?
    init(name: String? = nil, quantity: Int? = nil, checked: Int? = nil, sortOrder: Int? = nil) {
        self.name = name; self.quantity = quantity; self.checked = checked; self.sortOrder = sortOrder
    }
}
private struct ReorderItemEntry: Encodable { let id: String; let sortOrder: Int }
private struct CreateListBody: Encodable { let name: String }
private struct RenameListBody: Encodable { let name: String }

// MARK: - Auth

func login(email: String, password: String) async throws -> LoginResponse {
    try await APIClient.shared.request("/auth/login", method: .post, body: LoginBody(email: email, password: password), requiresAuth: false)
}

func register(name: String, email: String, password: String) async throws -> LoginResponse {
    try await APIClient.shared.request("/auth/register", method: .post, body: RegisterBody(email: email, password: password, name: name), requiresAuth: false)
}

func forgotPassword(email: String) async throws {
    try await APIClient.shared.requestVoid("/auth/forgot-password", method: .post, body: ForgotPasswordBody(email: email), requiresAuth: false)
}

func resetPassword(email: String, code: String, newPassword: String) async throws {
    try await APIClient.shared.requestVoid("/auth/reset-password", method: .post, body: ResetPasswordBody(email: email, code: code, newPassword: newPassword), requiresAuth: false)
}

func updateMe(name: String) async throws -> User {
    try await APIClient.shared.request("/auth/me", method: .patch, body: UpdateMeBody(name: name))
}

// MARK: - Shopping Lists

func fetchShoppingLists() async throws -> [ShoppingList] {
    try await APIClient.shared.request("/lists/groups")
}

func createShoppingList(name: String) async throws -> ShoppingList {
    try await APIClient.shared.request("/lists/groups", method: .post, body: CreateListBody(name: name))
}

func renameShoppingList(id: String, name: String) async throws -> ShoppingList {
    try await APIClient.shared.request("/lists/groups/\(id)", method: .patch, body: RenameListBody(name: name))
}

func deleteShoppingList(id: String) async throws {
    try await APIClient.shared.requestVoid("/lists/groups/\(id)", method: .delete)
}

// MARK: - List Items

func fetchListItems(listId: String? = nil) async throws -> [ListItem] {
    var queryItems: [URLQueryItem]? = nil
    if let listId {
        queryItems = [URLQueryItem(name: "list_id", value: listId)]
    }
    return try await APIClient.shared.request("/lists", queryItems: queryItems)
}

func addListItem(name: String, quantity: Int = 1, listId: String? = nil) async throws -> ListItem {
    try await APIClient.shared.request("/lists/items", method: .post, body: AddItemBody(name: name, quantity: quantity, listId: listId))
}

func parseAndAddItems(text: String, listId: String? = nil) async throws -> [ListItem] {
    try await APIClient.shared.request("/lists/items/bulk", method: .post, body: BulkAddBody(text: text, listId: listId))
}

func updateListItem(id: String, name: String? = nil, quantity: Int? = nil, checked: Int? = nil, sortOrder: Int? = nil) async throws -> ListItem {
    try await APIClient.shared.request("/lists/items/\(id)", method: .patch, body: UpdateItemBody(name: name, quantity: quantity, checked: checked, sortOrder: sortOrder))
}

func reorderListItems(_ items: [(id: String, sortOrder: Int)]) async throws {
    let body = items.map { ReorderItemEntry(id: $0.id, sortOrder: $0.sortOrder) }
    try await APIClient.shared.requestVoid("/lists/items/reorder", method: .put, body: body)
}

func deleteListItem(id: String) async throws {
    try await APIClient.shared.requestVoid("/lists/items/\(id)", method: .delete)
}

func hardDeleteItem(id: String) async throws {
    try await APIClient.shared.requestVoid("/lists/items/\(id)/permanent", method: .delete)
}

func fetchDeletedItems(listId: String? = nil) async throws -> [ListItem] {
    var queryItems: [URLQueryItem]? = nil
    if let listId {
        queryItems = [URLQueryItem(name: "list_id", value: listId)]
    }
    return try await APIClient.shared.request("/lists/items/deleted", queryItems: queryItems)
}

func parseItemText(text: String, listId: String? = nil) async throws -> [ParsedItem] {
    try await APIClient.shared.request("/lists/items/parse-text", method: .post, body: ParseTextBody(text: text, listId: listId))
}

// MARK: - Suggestions

func fetchAISuggestions(listId: String? = nil) async throws -> [RawSuggestion] {
    var queryItems: [URLQueryItem]? = nil
    if let listId {
        queryItems = [URLQueryItem(name: "list_id", value: listId)]
    }
    return try await APIClient.shared.request("/lists/suggestions", queryItems: queryItems)
}

func fetchRecipeSuggestions(listId: String? = nil) async throws -> [RawSuggestion] {
    var queryItems: [URLQueryItem]? = nil
    if let listId {
        queryItems = [URLQueryItem(name: "list_id", value: listId)]
    }
    return try await APIClient.shared.request("/lists/recipe-suggestions", queryItems: queryItems)
}

// MARK: - Products

func searchProducts(query: String) async throws -> [Product] {
    try await APIClient.shared.request("/products/search", queryItems: [URLQueryItem(name: "q", value: query)])
}

func fetchProduct(id: String) async throws -> Product {
    try await APIClient.shared.request("/products/\(id)")
}
