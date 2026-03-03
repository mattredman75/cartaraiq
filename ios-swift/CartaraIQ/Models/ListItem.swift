import Foundation

struct ListItem: Identifiable, Codable, Equatable {
    let id: String
    var name: String
    var checked: Int        // 0 = active, 1 = done, 2 = soft-deleted
    var quantity: Int
    var unit: String?
    var sortOrder: Int?
    var listId: String?
    var timesAdded: Int
    var createdAt: String?

    var isActive: Bool { checked == 0 }
    var isDone: Bool { checked == 1 }
    var isDeleted: Bool { checked == 2 }

    var displayQuantity: String? {
        guard quantity > 1 else { return nil }
        if let unit {
            return "\(quantity) \(pluralUnit(unit, quantity: quantity))"
        }
        return "\(quantity)×"
    }

    private func pluralUnit(_ unit: String, quantity: Int) -> String {
        guard quantity > 1 else { return unit }
        let plurals: [String: String] = [
            "loaf": "loaves", "roll": "rolls", "slice": "slices",
            "sheet": "sheets", "bar": "bars", "jar": "jars",
            "tub": "tubs", "punnet": "punnets", "sachet": "sachets",
            "piece": "pieces", "pack": "packs", "packet": "packets",
            "bottle": "bottles", "can": "cans", "bag": "bags",
            "box": "boxes", "bunch": "bunches", "cup": "cups"
        ]
        return plurals[unit] ?? unit + "s"
    }
}
