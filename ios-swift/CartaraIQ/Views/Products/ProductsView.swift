import SwiftUI

struct ProductsView: View {
    @State private var query = ""
    @State private var products: [Product] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            ZStack {
                Color.surface.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.muted)
                        TextField("Search products…", text: $query)
                            .submitLabel(.search)
                            .onSubmit(search)
                        if !query.isEmpty {
                            Button(action: { query = ""; products = [] }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.muted)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.card)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.border, lineWidth: 1))
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 12)

                    if isLoading {
                        Spacer()
                        ProgressView().tint(.primaryTeal)
                        Spacer()
                    } else if let error = errorMessage {
                        Spacer()
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundColor(.danger)
                            .padding()
                        Spacer()
                    } else if products.isEmpty && !query.isEmpty {
                        Spacer()
                        VStack(spacing: 12) {
                            Text("🔍")
                                .font(.system(size: 40))
                            Text("No products found")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.ink)
                            Text("Try a different search term")
                                .font(.system(size: 14))
                                .foregroundColor(.muted)
                        }
                        Spacer()
                    } else if products.isEmpty {
                        Spacer()
                        VStack(spacing: 12) {
                            Text("🛒")
                                .font(.system(size: 40))
                            Text("Search for products")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.ink)
                            Text("Find products to add to your list")
                                .font(.system(size: 14))
                                .foregroundColor(.muted)
                        }
                        Spacer()
                    } else {
                        List(products) { product in
                            NavigationLink(destination: ProductDetailView(product: product)) {
                                ProductRowView(product: product)
                            }
                            .listRowBackground(Color.card)
                            .listRowSeparatorTint(Color.border)
                        }
                        .listStyle(.insetGrouped)
                        .scrollContentBackground(.hidden)
                        .background(Color.surface)
                    }
                }
            }
            .navigationTitle("Products")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    private func search() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                products = try await searchProducts(query: q)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

private struct ProductRowView: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(product.name)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.ink)
            if let category = product.category {
                Text(category)
                    .font(.system(size: 12))
                    .foregroundColor(.muted)
            }
        }
        .padding(.vertical, 4)
    }
}
