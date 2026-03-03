import SwiftUI

struct ProductDetailView: View {
    @Environment(ListViewModel.self) private var vm
    let product: Product

    @State private var added = false

    var body: some View {
        ZStack {
            Color.surface.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Product image placeholder
                    ZStack {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color.primaryTeal.opacity(0.08))
                            .frame(height: 200)
                        Text("🛒")
                            .font(.system(size: 60))
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 12) {
                        // Category badge
                        if let category = product.category {
                            Text(category.uppercased())
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.primaryTeal)
                                .tracking(0.8)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color.primaryTeal.opacity(0.1))
                                .cornerRadius(8)
                        }

                        Text(product.name)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.ink)

                        if let description = product.description {
                            Text(description)
                                .font(.system(size: 15))
                                .foregroundColor(.muted)
                                .lineSpacing(4)
                        }
                    }
                    .padding(.horizontal, 20)

                    // Add to list button
                    Button(action: addToList) {
                        HStack(spacing: 8) {
                            Image(systemName: added ? "checkmark" : "plus")
                                .font(.system(size: 16, weight: .semibold))
                            Text(added ? "Added!" : "Add to List")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(added ? Color.success : Color.primaryTeal)
                        .cornerRadius(12)
                        .animation(.easeInOut(duration: 0.2), value: added)
                    }
                    .padding(.horizontal, 20)
                    .disabled(added)
                }
                .padding(.bottom, 40)
            }
        }
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func addToList() {
        Task {
            await vm.addItem(product.name)
            withAnimation { added = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                withAnimation { added = false }
            }
        }
    }
}
