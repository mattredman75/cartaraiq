import SwiftUI

struct SuggestionsStripView: View {
    @Environment(ListViewModel.self) private var vm
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        if vm.suggestions.isEmpty { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 12) {
                Text("SMART SUGGESTIONS")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.muted)
                    .padding(.horizontal, 20)
                    .tracking(0.8)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(vm.suggestions) { suggestion in
                            SuggestionCard(suggestion: suggestion)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.top, 20)
        )
    }
}

private struct SuggestionCard: View {
    @Environment(ListViewModel.self) private var vm
    @Environment(AuthViewModel.self) private var auth

    let suggestion: Suggestion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Dismiss button
            HStack {
                Spacer()
                Button(action: {
                    guard let userId = auth.user?.id else { return }
                    vm.dismissSuggestion(suggestion, userId: userId)
                }) {
                    Text("✕")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.muted)
                        .padding(8)
                }
            }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(suggestion.name)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.ink)
                    .lineLimit(2)
                    .padding(.horizontal, 14)

                if let reason = suggestion.reason {
                    Text(reason)
                        .font(.system(size: 11))
                        .foregroundColor(.muted)
                        .lineLimit(2)
                        .lineSpacing(2)
                        .padding(.horizontal, 14)
                }
            }

            Spacer()

            // Add button
            Button(action: {
                Task { await vm.addSuggestion(suggestion) }
            }) {
                Text("+ Add")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.primaryTeal)
                    .cornerRadius(8)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
        }
        .frame(width: 148, height: 140)
        .background(suggestion.isRecipe ? Color(hex: "E6F4F6") : Color.card)
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(suggestion.isRecipe ? Color(hex: "B8D9DF") : Color.border, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.07), radius: 8, x: 0, y: 2)
    }
}
