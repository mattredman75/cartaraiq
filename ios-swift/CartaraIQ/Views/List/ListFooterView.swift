import SwiftUI

struct ListFooterView: View {
    @Environment(ListViewModel.self) private var vm

    let onLongPress: (ListItem) -> Void
    @State private var isExpanded = true

    var body: some View {
        VStack(spacing: 0) {
            // Empty state
            if vm.items.isEmpty && !vm.isLoading {
                VStack(spacing: 14) {
                    Text("🛒")
                        .font(.system(size: 52))
                    Text("Your list is empty")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.ink)
                    Text("Add items above or pick from AI suggestions")
                        .font(.system(size: 14))
                        .foregroundColor(.muted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
            }

            // Loading
            if vm.items.isEmpty && vm.isLoading {
                ProgressView()
                    .tint(.primaryTeal)
                    .scaleEffect(1.5)
                    .padding(.top, 60)
            }

            // Done section
            if !vm.checkedItems.isEmpty {
                VStack(spacing: 0) {
                    // Header
                    Button(action: { withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() } }) {
                        HStack {
                            Text("DONE (\(vm.checkedItems.count))")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.muted)
                                .tracking(0.8)
                            Spacer()
                            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.muted)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                        .padding(.bottom, 10)
                    }

                    if isExpanded {
                        ForEach(vm.checkedItems) { item in
                            ItemRowView(
                                item: item,
                                onToggle: { Task { await vm.toggleItem(item) } },
                                onDelete: { Task { await vm.deleteItem(item) } },
                                onLongPress: { onLongPress(item) }
                            )
                        }
                    }
                }
                .transition(.opacity)
            }
        }
        .padding(.bottom, 32)
    }
}
