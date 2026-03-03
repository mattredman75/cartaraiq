import SwiftUI

struct ListSwitcherModal: View {
    @Environment(ListViewModel.self) private var vm
    @Binding var isPresented: Bool

    @State private var newListName = ""
    @State private var showNewListField = false
    @State private var editingList: ShoppingList? = nil
    @State private var showEditModal = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(vm.lists) { list in
                    HStack {
                        // Select
                        Button(action: {
                            Task { await vm.switchToList(list) }
                            isPresented = false
                        }) {
                            HStack(spacing: 12) {
                                Image(systemName: vm.currentListId == list.id ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 20))
                                    .foregroundColor(vm.currentListId == list.id ? .primaryTeal : .muted)
                                Text(list.name)
                                    .font(.system(size: 16))
                                    .foregroundColor(.ink)
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)

                        // Edit
                        Button(action: { editingList = list; showEditModal = true }) {
                            Image(systemName: "pencil")
                                .font(.system(size: 14))
                                .foregroundColor(.muted)
                                .padding(8)
                        }
                        .buttonStyle(.plain)

                        // Delete (not current)
                        if vm.lists.count > 1 {
                            Button(role: .destructive, action: {
                                Task { await vm.deleteList(list) }
                            }) {
                                Image(systemName: "trash")
                                    .font(.system(size: 14))
                                    .foregroundColor(.danger)
                                    .padding(8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .listRowBackground(Color.card)
                }

                // New list section
                if showNewListField {
                    HStack {
                        TextField("List name", text: $newListName)
                            .font(.system(size: 15))
                            .submitLabel(.done)
                            .onSubmit(createList)

                        Button("Create", action: createList)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.primaryTeal)
                    }
                    .listRowBackground(Color.card)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.surface)
            .navigationTitle("My Lists")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { isPresented = false }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { withAnimation { showNewListField.toggle() } }) {
                        Image(systemName: "plus")
                    }
                    .tint(.primaryTeal)
                }
            }
        }
        .sheet(isPresented: $showEditModal) {
            if let list = editingList {
                EditListNameModal(isPresented: $showEditModal, list: list)
                    .presentationDetents([.height(220)])
                    .environment(vm)
            }
        }
    }

    private func createList() {
        let name = newListName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        Task {
            await vm.createList(name: name)
            newListName = ""
            showNewListField = false
        }
    }
}
