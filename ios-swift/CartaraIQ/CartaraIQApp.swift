import SwiftUI

@main
struct CartaraIQApp: App {
    @State private var auth = AuthViewModel()
    @State private var list = ListViewModel()

    var body: some Scene {
        WindowGroup {
            if auth.isAuthenticated {
                MainTabView()
                    .environment(auth)
                    .environment(list)
            } else {
                WelcomeView()
                    .environment(auth)
                    .environment(list)
            }
        }
    }
}

struct MainTabView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(ListViewModel.self) private var vm

    var body: some View {
        TabView {
            ListScreen()
                .tabItem {
                    Label("List", systemImage: "cart")
                }

            ProductsView()
                .tabItem {
                    Label("Products", systemImage: "magnifyingglass")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
        }
        .tint(Color.primaryTeal)
    }
}
