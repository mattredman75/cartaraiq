import Foundation

class AppStorageManager {
    static let shared = AppStorageManager()

    private let defaults = UserDefaults.standard

    // MARK: - Feature Flags

    var aiSuggestionsEnabled: Bool {
        get {
            guard defaults.object(forKey: "ai_suggestions_enabled") != nil else { return true }
            return defaults.bool(forKey: "ai_suggestions_enabled")
        }
        set {
            defaults.set(newValue, forKey: "ai_suggestions_enabled")
            // Disabling AI also disables pairing
            if !newValue {
                defaults.set(false, forKey: "pairing_suggestions_enabled")
            }
        }
    }

    var pairingSuggestionsEnabled: Bool {
        get {
            guard defaults.object(forKey: "pairing_suggestions_enabled") != nil else { return true }
            return defaults.bool(forKey: "pairing_suggestions_enabled")
        }
        set {
            defaults.set(newValue, forKey: "pairing_suggestions_enabled")
        }
    }

    // MARK: - Dismissed Suggestions

    private func dismissedKey(for userId: String) -> String {
        "dismissed_\(userId)"
    }

    func dismissedUntil(for userId: String) -> [String: Date] {
        guard let raw = defaults.dictionary(forKey: dismissedKey(for: userId)) as? [String: TimeInterval] else {
            return [:]
        }
        return raw.mapValues { Date(timeIntervalSince1970: $0) }
    }

    func isDismissed(_ itemName: String, for userId: String) -> Bool {
        let map = dismissedUntil(for: userId)
        guard let until = map[itemName.lowercased()] else { return false }
        return until > Date()
    }

    func setDismissed(_ itemName: String, for userId: String, until date: Date) {
        let key = dismissedKey(for: userId)
        var current = defaults.dictionary(forKey: key) as? [String: TimeInterval] ?? [:]
        current[itemName.lowercased()] = date.timeIntervalSince1970
        defaults.set(current, forKey: key)
    }

    func dismissFor7Days(_ itemName: String, userId: String) {
        let until = Date().addingTimeInterval(7 * 24 * 60 * 60)
        setDismissed(itemName, for: userId, until: until)
    }

    func clearDismissed(for userId: String) {
        defaults.removeObject(forKey: dismissedKey(for: userId))
    }
}
