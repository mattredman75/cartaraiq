import Foundation

// Raw response from the API — both AI and recipe suggestions
struct RawSuggestion: Codable {
    let name: String
    let reason: String?
}

// Merged suggestion with type tag (applied client-side)
struct Suggestion: Identifiable {
    let id = UUID()
    let name: String
    let reason: String?
    let type: SuggestionType

    enum SuggestionType: String {
        case ai = "ai"
        case recipe = "recipe"
    }

    var isRecipe: Bool { type == .recipe }
}
