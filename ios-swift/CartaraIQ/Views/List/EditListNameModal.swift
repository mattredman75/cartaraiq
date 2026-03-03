import SwiftUI

struct EditListNameModal: View {
    @Environment(ListViewModel.self) private var vm
    @Binding var isPresented: Bool
    let list: ShoppingList

    @State private var name: String

    init(isPresented: Binding<Bool>, list: ShoppingList) {
        self._isPresented = isPresented
        self.list = list
        self._name = State(initialValue: list.name)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Rename list")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.ink)

            TextField("List name", text: $name)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(Color.surface)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.border, lineWidth: 1)
                )
                .font(.system(size: 15))

            HStack(spacing: 12) {
                Button("Cancel") { isPresented = false }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.surface)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.border, lineWidth: 1))
                    .foregroundColor(.ink)
                    .font(.system(size: 15, weight: .semibold))

                Button("Save") {
                    let trimmed = name.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty, trimmed != list.name else { isPresented = false; return }
                    Task { await vm.renameList(list, to: trimmed) }
                    isPresented = false
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.primaryTeal)
                .cornerRadius(12)
                .foregroundColor(.white)
                .font(.system(size: 15, weight: .semibold))
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(24)
        .background(Color.card)
        .cornerRadius(20)
        .padding(.horizontal, 20)
    }
}
