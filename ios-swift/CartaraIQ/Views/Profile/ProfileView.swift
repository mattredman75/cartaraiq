import SwiftUI

struct ProfileView: View {
    @Environment(AuthViewModel.self) private var auth
    @State private var showSettings = false
    @State private var showSignOutConfirm = false
    @State private var editingName = false
    @State private var nameInput = ""

    var body: some View {
        NavigationStack {
            ZStack {
                Color.surface.ignoresSafeArea()

                List {
                    // Avatar + name
                    Section {
                        HStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(Color.primaryTeal.opacity(0.15))
                                    .frame(width: 64, height: 64)
                                Text(initials)
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundColor(.primaryTeal)
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text(auth.user?.name ?? "")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(.ink)
                                Text(auth.user?.email ?? "")
                                    .font(.system(size: 14))
                                    .foregroundColor(.muted)
                            }

                            Spacer()

                            Button(action: {
                                nameInput = auth.user?.name ?? ""
                                editingName = true
                            }) {
                                Image(systemName: "pencil")
                                    .foregroundColor(.muted)
                                    .padding(8)
                                    .background(Color.surface)
                                    .clipShape(Circle())
                            }
                        }
                        .padding(.vertical, 8)
                        .listRowBackground(Color.card)
                    }

                    // Settings
                    Section {
                        Button(action: { showSettings = true }) {
                            HStack {
                                Label("Settings", systemImage: "gearshape")
                                    .foregroundColor(.ink)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12))
                                    .foregroundColor(.muted)
                            }
                        }
                        .listRowBackground(Color.card)
                    }

                    // Sign out
                    Section {
                        Button(role: .destructive, action: { showSignOutConfirm = true }) {
                            Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                        .listRowBackground(Color.card)
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(Color.surface)
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet(isPresented: $showSettings)
                .presentationDetents([.height(320)])
        }
        .alert("Sign Out", isPresented: $showSignOutConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) { auth.signOut() }
        } message: {
            Text("Are you sure you want to sign out?")
        }
        .alert("Edit Name", isPresented: $editingName) {
            TextField("Full name", text: $nameInput)
            Button("Cancel", role: .cancel) {}
            Button("Save") {
                let name = nameInput.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                Task { await auth.updateName(name) }
            }
        } message: {
            Text("Enter your new display name")
        }
    }

    private var initials: String {
        let parts = (auth.user?.name ?? "").components(separatedBy: " ")
        let first = parts.first?.first.map(String.init) ?? ""
        let last = parts.count > 1 ? parts.last?.first.map(String.init) ?? "" : ""
        return (first + last).uppercased()
    }
}
