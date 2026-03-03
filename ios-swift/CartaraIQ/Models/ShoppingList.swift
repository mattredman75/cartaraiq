import Foundation

struct ShoppingList: Identifiable, Codable, Equatable {
    let id: String
    var name: String
    var createdAt: String?
}
