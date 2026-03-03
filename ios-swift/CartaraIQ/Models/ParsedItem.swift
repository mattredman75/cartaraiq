import Foundation

struct ParsedItem: Codable {
    let name: String
    let quantity: Int?
    let unit: String?
}

struct Product: Identifiable, Codable {
    let id: String
    let name: String
    let description: String?
    let category: String?
    let imageUrl: String?
}
