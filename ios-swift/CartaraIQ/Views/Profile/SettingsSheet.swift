import SwiftUI

struct SettingsSheet: View {
    @Binding var isPresented: Bool

    // Use @State backed by AppStorageManager so changes persist immediately
    @State private var aiEnabled: Bool = AppStorageManager.shared.aiSuggestionsEnabled
    @State private var pairingEnabled: Bool = AppStorageManager.shared.pairingSuggestionsEnabled

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Handle
            HStack {
                Spacer()
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.border)
                    .frame(width: 36, height: 4)
                Spacer()
            }
            .padding(.top, 12)
            .padding(.bottom, 20)

            Text("Settings")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.ink)
                .padding(.horizontal, 24)
                .padding(.bottom, 20)

            Divider().padding(.horizontal, 24)

            // AI Suggestions toggle
            VStack(spacing: 0) {
                SettingsToggleRow(
                    icon: "sparkles",
                    title: "AI Suggestions",
                    subtitle: "Personalised shopping predictions",
                    isOn: $aiEnabled
                )
                .onChange(of: aiEnabled) { _, value in
                    AppStorageManager.shared.aiSuggestionsEnabled = value
                    if !value { pairingEnabled = false }
                }

                Divider().padding(.leading, 60)

                SettingsToggleRow(
                    icon: "fork.knife",
                    title: "Pairing Suggestions",
                    subtitle: "Recipe-based item recommendations",
                    isOn: $pairingEnabled
                )
                .disabled(!aiEnabled)
                .opacity(aiEnabled ? 1 : 0.4)
                .onChange(of: pairingEnabled) { _, value in
                    AppStorageManager.shared.pairingSuggestionsEnabled = value
                }
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .background(Color.card)
    }
}

private struct SettingsToggleRow: View {
    let icon: String
    let title: String
    let subtitle: String
    @Binding var isOn: Bool

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.primaryTeal.opacity(0.1))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundColor(.primaryTeal)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.ink)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundColor(.muted)
            }

            Spacer()

            Toggle("", isOn: $isOn)
                .tint(.primaryTeal)
                .labelsHidden()
        }
        .padding(.vertical, 14)
    }
}
