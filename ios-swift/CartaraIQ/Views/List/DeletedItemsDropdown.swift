import SwiftUI

struct DeletedItemsDropdown: View {
    @Environment(ListViewModel.self) private var vm
    @State private var isExpanded = false

    var body: some View {
        if vm.deletedItems.isEmpty { return AnyView(EmptyView()) }

        return AnyView(
            VStack(spacing: 0) {
                // Header
                Button(action: { withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() } }) {
                    HStack {
                        Text("DELETED (\(vm.deletedItems.count))")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.muted)
                            .tracking(0.8)
                        Spacer()
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.muted)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                }

                if isExpanded {
                    VStack(spacing: 8) {
                        ForEach(vm.deletedItems) { item in
                            DeletedItemRow(item: item)
                        }
                    }
                    .padding(.bottom, 12)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .background(Color.surface)
        )
    }
}

private struct DeletedItemRow: View {
    @Environment(ListViewModel.self) private var vm
    let item: ListItem

    var body: some View {
        HStack(spacing: 12) {
            Text(item.name)
                .font(.system(size: 14))
                .foregroundColor(.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Restore
            Button(action: { Task { await vm.restoreItem(item) } }) {
                Image(systemName: "arrow.uturn.left")
                    .font(.system(size: 13))
                    .foregroundColor(.primaryTeal)
                    .padding(8)
                    .background(Color.primaryTeal.opacity(0.1))
                    .clipShape(Circle())
            }

            // Hard delete
            Button(action: { Task { await vm.hardDeleteItem(item) } }) {
                Image(systemName: "trash")
                    .font(.system(size: 13))
                    .foregroundColor(.danger)
                    .padding(8)
                    .background(Color.danger.opacity(0.1))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 4)
    }
}
