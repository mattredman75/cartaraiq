import WidgetKit
import SwiftUI

// MARK: - Shared Data Model

private let appGroupID = "group.com.cartaraiq.app"
private let userDefaultsKey = "widgetData"

struct WidgetItem: Codable, Identifiable {
  let id: String
  let name: String
  let quantity: Double
  let unit: String?
  let checked: Int
}

struct WidgetPayload: Codable {
  let listName: String
  let items: [WidgetItem]
  let lastUpdated: Int
}

// MARK: - Timeline Provider

struct CartaraIQWidgetEntry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
}

struct CartaraIQWidgetProvider: TimelineProvider {

  func placeholder(in context: Context) -> CartaraIQWidgetEntry {
    CartaraIQWidgetEntry(date: Date(), payload: WidgetPayload(
      listName: "Weekly Shop",
      items: [
        WidgetItem(id: "1", name: "Milk", quantity: 1, unit: "L", checked: 0),
        WidgetItem(id: "2", name: "Eggs", quantity: 12, unit: nil, checked: 0),
        WidgetItem(id: "3", name: "Bread", quantity: 1, unit: nil, checked: 1),
      ],
      lastUpdated: Int(Date().timeIntervalSince1970)
    ))
  }

  func getSnapshot(in context: Context, completion: @escaping (CartaraIQWidgetEntry) -> Void) {
    completion(CartaraIQWidgetEntry(date: Date(), payload: loadPayload()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CartaraIQWidgetEntry>) -> Void) {
    let entry = CartaraIQWidgetEntry(date: Date(), payload: loadPayload())
    // Refresh every 30 minutes, or when app pushes via WidgetCenter.reloadAllTimelines()
    let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }

  private func loadPayload() -> WidgetPayload? {
    guard
      let defaults = UserDefaults(suiteName: appGroupID),
      let json = defaults.string(forKey: userDefaultsKey),
      let data = json.data(using: .utf8),
      let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data)
    else { return nil }
    return payload
  }
}

// MARK: - Views

struct CartaraIQWidgetEntryView: View {
  var entry: CartaraIQWidgetEntry
  @Environment(\.widgetFamily) var family

  var unchecked: [WidgetItem] {
    (entry.payload?.items ?? []).filter { $0.checked == 0 }
  }
  var checkedCount: Int {
    (entry.payload?.items ?? []).filter { $0.checked == 1 }.count
  }
  var totalCount: Int { entry.payload?.items.count ?? 0 }
  var listName: String { entry.payload?.listName ?? "CartaraIQ" }

  // Limit items shown based on widget size
  var visibleItems: [WidgetItem] {
    let limit = family == .systemSmall ? 3 : 6
    return Array(unchecked.prefix(limit))
  }
  var remainingCount: Int { max(0, unchecked.count - visibleItems.count) }

  var body: some View {
    ZStack {
      Color(red: 0.106, green: 0.420, blue: 0.475) // #1B6B7A teal

      VStack(alignment: .leading, spacing: 0) {

        // Header
        HStack(spacing: 6) {
          Image(systemName: "cart.fill")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Color.white.opacity(0.7))
          Text(listName)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(1)
          Spacer()
          if totalCount > 0 {
            Text("\(checkedCount)/\(totalCount)")
              .font(.system(size: 11, weight: .medium))
              .foregroundColor(Color.white.opacity(0.6))
          }
        }
        .padding(.bottom, 8)

        if visibleItems.isEmpty {
          Spacer()
          HStack {
            Spacer()
            if entry.payload == nil {
              Text("Open CartaraIQ\nto load your list")
                .font(.system(size: 12))
                .foregroundColor(Color.white.opacity(0.6))
                .multilineTextAlignment(.center)
            } else {
              Label("All done!", systemImage: "checkmark.circle.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color.white.opacity(0.8))
            }
            Spacer()
          }
          Spacer()
        } else {
          VStack(alignment: .leading, spacing: 5) {
            ForEach(visibleItems) { item in
              ItemRowView(item: item)
            }
            if remainingCount > 0 {
              Text("+\(remainingCount) more")
                .font(.system(size: 10))
                .foregroundColor(Color.white.opacity(0.55))
                .padding(.top, 1)
            }
          }
          Spacer(minLength: 0)
        }
      }
      .padding(14)
    }
  }
}

struct ItemRowView: View {
  let item: WidgetItem

  var quantityLabel: String? {
    guard item.quantity > 0 else { return nil }
    let q = item.quantity == Double(Int(item.quantity))
      ? String(Int(item.quantity))
      : String(format: "%.1f", item.quantity)
    if let unit = item.unit, !unit.isEmpty {
      return "\(q) \(unit)"
    }
    return item.quantity > 1 ? q : nil
  }

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .stroke(Color.white.opacity(0.5), lineWidth: 1.2)
        .frame(width: 10, height: 10)
      Text(item.name)
        .font(.system(size: 13, weight: .medium))
        .foregroundColor(.white)
        .lineLimit(1)
      Spacer()
      if let qty = quantityLabel {
        Text(qty)
          .font(.system(size: 11))
          .foregroundColor(Color.white.opacity(0.6))
      }
    }
  }
}

// MARK: - Widget Configuration

@main
struct CartaraIQWidgetBundle: Widget {
  let kind: String = "CartaraIQWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CartaraIQWidgetProvider()) { entry in
      if #available(iOSApplicationExtension 17.0, *) {
        CartaraIQWidgetEntryView(entry: entry)
          .containerBackground(Color(red: 0.106, green: 0.420, blue: 0.475), for: .widget)
      } else {
        CartaraIQWidgetEntryView(entry: entry)
      }
    }
    .configurationDisplayName("Shopping List")
    .description("See your CartaraIQ shopping list at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
