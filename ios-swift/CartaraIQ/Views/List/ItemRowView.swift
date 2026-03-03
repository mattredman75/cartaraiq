import SwiftUI

struct ItemRowView: View {
    let item: ListItem
    let onToggle: () -> Void
    let onDelete: () -> Void
    let onLongPress: () -> Void

    @State private var offset: CGFloat = 0
    @State private var isSwipedOpen = false
    @State private var tiltDegrees: Double = 0

    private let deleteWidth: CGFloat = 80

    var body: some View {
        ZStack(alignment: .trailing) {
            // Delete zone
            Button(action: onDelete) {
                Text("Delete")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: deleteWidth)
                    .frame(maxHeight: .infinity)
                    .background(Color.danger)
            }
            .frame(width: deleteWidth)

            // Row content
            HStack(spacing: 12) {
                // Checkbox + name
                Button(action: onToggle) {
                    HStack(spacing: 12) {
                        // Checkbox
                        ZStack {
                            Circle()
                                .stroke(item.isDone ? Color.primaryTeal : Color.border, lineWidth: 2)
                                .frame(width: 26, height: 26)
                            if item.isDone {
                                Circle()
                                    .fill(Color.primaryTeal)
                                    .frame(width: 26, height: 26)
                                Text("✓")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }

                        // Name + frequency
                        VStack(alignment: .leading, spacing: 2) {
                            Text(displayName)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(item.isDone ? .muted : .ink)
                                .strikethrough(item.isDone)
                                .lineLimit(2)

                            if item.timesAdded > 1 {
                                Text("Added \(item.timesAdded)× before")
                                    .font(.system(size: 11))
                                    .foregroundColor(.muted)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.4)
                        .onEnded { _ in onLongPress() }
                )

                // Drag handle
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 14))
                    .foregroundColor(.border)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(Color.card)
            .offset(x: offset)
            .gesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        let base: CGFloat = isSwipedOpen ? -deleteWidth : 0
                        offset = min(0, max(base + value.translation.width, -deleteWidth - 8))
                    }
                    .onEnded { value in
                        let base: CGFloat = isSwipedOpen ? -deleteWidth : 0
                        let finalX = base + value.translation.width
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                            if finalX <= -55 {
                                offset = -deleteWidth
                                isSwipedOpen = true
                            } else {
                                offset = 0
                                isSwipedOpen = false
                            }
                        }
                    }
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color(hex: "C5D5D9"), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 6, x: 0, y: 1)
        .rotation3DEffect(.degrees(tiltDegrees), axis: (x: 0, y: 0, z: 1))
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
        .onAppear {
            // Brief add animation
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                tiltDegrees = 2
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    tiltDegrees = 0
                }
            }
        }
    }

    private var displayName: String {
        if item.quantity > 1 {
            if let unit = item.unit {
                return "\(item.displayQuantity ?? "") \(item.name)"
            }
            return "\(item.quantity)× \(item.name)"
        }
        return item.name
    }
}
