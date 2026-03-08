import SwiftUI

struct ListHeaderView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(ListViewModel.self) private var vm

    let onOpenListSwitcher: () -> Void
    let onOpenSettings: () -> Void

    @State private var inputText = ""
    @FocusState private var inputFocused: Bool

    private var firstName: String {
        auth.user?.name.components(separatedBy: " ").first ?? "there"
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Morning" }
        if hour < 17 { return "Afternoon" }
        return "Evening"
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // Decorative circles
            Color.primaryTealDark

            Circle()
                .fill(Color.white.opacity(0.05))
                .frame(width: 180, height: 180)
                .offset(x: UIScreen.main.bounds.width - 80, y: -50)

            Circle()
                .fill(Color.cyanAccent.opacity(0.12))
                .frame(width: 80, height: 80)
                .offset(x: UIScreen.main.bounds.width - 120, y: 10)

            Circle()
                .fill(Color.white.opacity(0.04))
                .frame(width: 150, height: 150)
                .offset(x: -40, y: 140)

            VStack(alignment: .leading, spacing: 0) {
                // Top row: list switcher + settings
                HStack {
                    if !vm.lists.isEmpty {
                        Button(action: onOpenListSwitcher) {
                            HStack(spacing: 4) {
                                Text(vm.currentList?.name ?? "My List")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                Text("▾")
                                    .font(.system(size: 11))
                                    .foregroundColor(Color.white.opacity(0.65))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.white.opacity(0.15))
                            .cornerRadius(10)
                        }
                    }
                    Spacer()
                    Button(action: onOpenSettings) {
                        Text("⚙")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.white.opacity(0.15))
                            .clipShape(Circle())
                    }
                }
                .padding(.bottom, 18)

                // Greeting
                Text("\(greeting),")
                    .font(.system(size: 14))
                    .foregroundColor(Color.white.opacity(0.6))
                    .padding(.bottom, 2)

                Text(firstName)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.bottom, 6)

                // Stats
                HStack(spacing: 16) {
                    if vm.activeItems.isEmpty {
                        statDot(color: .success, text: "All done!")
                    } else {
                        statDot(color: .amberAccent, text: "\(vm.activeItems.count) item\(vm.activeItems.count == 1 ? "" : "s") in your list")
                    }
                    if !vm.suggestions.isEmpty {
                        statDot(color: .cyanAccent, text: "\(vm.suggestions.count) Smart suggestions")
                    }
                }
                .padding(.bottom, 20)

                // Input row
                HStack(spacing: 0) {
                    TextField("Add to your list…", text: $inputText)
                        .focused($inputFocused)
                        .submitLabel(.done)
                        .onSubmit(submitItem)
                        .font(.system(size: 15))
                        .foregroundColor(.ink)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)

                    if vm.isLoading {
                        ProgressView()
                            .tint(.primaryTeal)
                            .padding(.trailing, 8)
                    }

                    VoiceButton { transcript in
                        let text = transcript.trimmingCharacters(in: .whitespaces)
                        guard !text.isEmpty else { return }
                        Task { await vm.addItem(text) }
                    }
                    .padding(.trailing, 6)
                }
                .background(Color.white)
                .cornerRadius(14)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
            .padding(.top, 12)
        }
        .clipShape(RoundedCorner(radius: 32, corners: [.bottomLeft, .bottomRight]))
    }

    private func submitItem() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        inputText = ""
        Task { await vm.addItem(text) }
    }

    private func statDot(color: Color, text: String) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(Color.white.opacity(0.75))
        }
    }
}

// Helper for bottom-only corner radius
struct RoundedCorner: Shape {
    var radius: CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}
