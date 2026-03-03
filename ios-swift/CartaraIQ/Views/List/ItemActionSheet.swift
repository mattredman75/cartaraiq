import SwiftUI

struct ItemActionSheet: View {
    @Environment(ListViewModel.self) private var vm
    @Binding var item: ListItem?
    @Binding var isPresented: Bool

    let onRename: (ListItem) -> Void

    @State private var isFixingWithAI = false

    var body: some View {
        VStack(spacing: 0) {
            // Handle
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.border)
                .frame(width: 36, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 20)

            // Item name
            if let item {
                Text(item.name)
                    .font(.system(size: 13))
                    .foregroundColor(.muted)
                    .lineLimit(1)
                    .padding(.bottom, 20)

                // Edit item
                Button(action: {
                    isPresented = false
                    onRename(item)
                }) {
                    Text("Edit item")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.border, lineWidth: 1)
                        )
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 12)

                // Fix with AI
                Button(action: {
                    Task {
                        isFixingWithAI = true
                        await vm.fixWithAI(item)
                        isFixingWithAI = false
                        isPresented = false
                    }
                }) {
                    Group {
                        if isFixingWithAI {
                            HStack(spacing: 8) {
                                ProgressView().tint(.white)
                                Text("Fixing…")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        } else {
                            Text("Fix with AI")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.primaryTeal)
                    .cornerRadius(14)
                }
                .disabled(isFixingWithAI)
                .padding(.horizontal, 24)
            }
        }
        .padding(.bottom, 32)
        .background(Color.card)
    }
}
