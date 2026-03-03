import SwiftUI

extension Color {
    static let primaryTealDark  = Color(hex: "0D4F5C")
    static let primaryTeal      = Color(hex: "1B6B7A")
    static let tealMid          = Color(hex: "2A8A9A")
    static let tealLight        = Color(hex: "4FB8C8")
    static let cyanAccent       = Color(hex: "00C2CB")
    static let amberAccent      = Color(hex: "F5C842")
    static let ink              = Color(hex: "1A1A2E")
    static let surface          = Color(hex: "DDE4E7")
    static let card             = Color(hex: "FFFFFF")
    static let border           = Color(hex: "E8F0F2")
    static let muted            = Color(hex: "64748B")
    static let danger           = Color(hex: "EF4444")
    static let success          = Color(hex: "10B981")

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
