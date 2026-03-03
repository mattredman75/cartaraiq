import SwiftUI

struct ListScreen: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(ListViewModel.self) private var vm

    @State private var actionItem: ListItem? = nil
    @State private var showActionSheet = false
    @State private var renameItem: ListItem? = nil
    @State private var showRenameModal = false
    @State private var showListSwitcher = false
    @State private var showSettings = false

    var body: some View {
        ZStack(alignment: .top) {
            Color.primaryTealDark.ignoresSafeArea(edges: .top)
            Color.surface.ignoresSafeArea(edges: .bottom)

            VStack(spacing: 0) {
                // Header
                ListHeaderView(
                    onOpenListSwitcher: { showListSwitcher = true },
                    onOpenSettings: { showSettings = true }
                )

                // Content
                if vm.lists.isEmpty && !vm.isLoading {
                    NoListsView()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            // Suggestions strip
                            SuggestionsStripView()

                            // Deleted items dropdown
                            DeletedItemsDropdown()

                            // "TO BUY" label
                            if !vm.activeItems.isEmpty {
                                HStack {
                                    Text("TO BUY (\(vm.activeItems.count))")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(.muted)
                                        .tracking(0.8)
                                    Spacer()
                                }
                                .padding(.horizontal, 20)
                                .padding(.top, 24)
                                .padding(.bottom, 10)
                            }

                            // Active items — reorderable
                            ForEach(vm.activeItems) { item in
                                ItemRowView(
                                    item: item,
                                    onToggle: { Task { await vm.toggleItem(item) } },
                                    onDelete: { Task { await vm.deleteItem(item) } },
                                    onLongPress: {
                                        actionItem = item
                                        showActionSheet = true
                                    }
                                )
                                .draggable(item.id) // Use drag with onMove below
                            }

                            // Footer (done + empty state)
                            ListFooterView(onLongPress: { item in
                                actionItem = item
                                showActionSheet = true
                            })
                        }
                    }
                    .refreshable {
                        await vm.reload()
                        if let userId = auth.user?.id {
                            await vm.loadSuggestions(userId: userId)
                        }
                    }
                }
            }
            .ignoresSafeArea(edges: .top)
        }
        .task {
            await vm.loadLists()
            await vm.loadItems()
            if let userId = auth.user?.id {
                await vm.loadSuggestions(userId: userId)
            }
        }
        // Action sheet
        .sheet(isPresented: $showActionSheet) {
            ItemActionSheet(
                item: $actionItem,
                isPresented: $showActionSheet,
                onRename: { item in
                    renameItem = item
                    showRenameModal = true
                }
            )
            .presentationDetents([.height(260)])
        }
        // Rename modal
        .sheet(isPresented: $showRenameModal) {
            if let item = renameItem {
                RenameItemModal(isPresented: $showRenameModal, item: item)
                    .presentationDetents([.height(220)])
            }
        }
        // List switcher
        .sheet(isPresented: $showListSwitcher) {
            ListSwitcherModal(isPresented: $showListSwitcher)
                .presentationDetents([.medium, .large])
        }
        // Settings
        .sheet(isPresented: $showSettings) {
            SettingsSheet(isPresented: $showSettings)
                .presentationDetents([.height(320)])
        }
        // Error alert
        .alert("Error", isPresented: .constant(vm.errorMessage != nil)) {
            Button("OK") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }
}

// MARK: - No Lists Empty State

private struct NoListsView: View {
    @Environment(ListViewModel.self) private var vm
    @State private var listName = ""

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Text("📋")
                .font(.system(size: 60))

            Text("No lists yet")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(.ink)

            Text("Create your first shopping list to get started.")
                .font(.system(size: 15))
                .foregroundColor(.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            VStack(spacing: 12) {
                TextField("List name (e.g. Weekly Shop)", text: $listName)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Color.card)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.border, lineWidth: 1))
                    .font(.system(size: 15))

                Button(action: {
                    let name = listName.trimmingCharacters(in: .whitespaces)
                    guard !name.isEmpty else { return }
                    Task { await vm.createList(name: name) }
                    listName = ""
                }) {
                    Text("Create List")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.primaryTeal)
                        .cornerRadius(12)
                }
                .disabled(listName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .background(Color.surface)
    }
}
