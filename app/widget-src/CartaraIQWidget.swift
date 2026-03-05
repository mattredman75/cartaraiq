import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared Constants & Models

private let appGroupID = "group.com.cartaraiq.app"
private let legacyDataKey = "widgetData"
private let allListsKey = "widgetAllLists"

struct WidgetItem: Identifiable {
  let id: String
  let name: String
  let quantity: Double
  let unit: String?
  let checked: Int

  /// Parse from a dictionary (JSONSerialization output) with resilient defaults.
  init?(from dict: [String: Any]) {
    guard let id = dict["id"] as? String,
          let name = dict["name"] as? String else { return nil }
    self.id = id
    self.name = name
    // Accept Int or Double for quantity
    if let q = dict["quantity"] as? Double { self.quantity = q }
    else if let q = dict["quantity"] as? Int { self.quantity = Double(q) }
    else { self.quantity = 1 }
    self.unit = dict["unit"] as? String
    if let c = dict["checked"] as? Int { self.checked = c }
    else { self.checked = 0 }
  }

  init(id: String, name: String, quantity: Double, unit: String?, checked: Int) {
    self.id = id
    self.name = name
    self.quantity = quantity
    self.unit = unit
    self.checked = checked
  }
}

struct ListEntry: Identifiable {
  let id: String
  let name: String
  let items: [WidgetItem]
}

/// Legacy single-list payload (backwards compat with existing synced data)
struct LegacyPayload {
  let listName: String
  let items: [WidgetItem]
  let lastUpdated: Int
}

// MARK: - Shared Data Loading

func loadAllLists() -> [ListEntry] {
  guard
    let defaults = UserDefaults(suiteName: appGroupID),
    let json = defaults.string(forKey: allListsKey),
    let data = json.data(using: .utf8),
    let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let rawLists = root["lists"] as? [[String: Any]]
  else { return [] }

  return rawLists.compactMap { dict -> ListEntry? in
    guard let id = dict["id"] as? String,
          let name = dict["name"] as? String else { return nil }
    let rawItems = dict["items"] as? [[String: Any]] ?? []
    let items = rawItems.compactMap { WidgetItem(from: $0) }
    return ListEntry(id: id, name: name, items: items)
  }
}

func loadListById(_ listId: String?) -> ListEntry? {
  guard let listId = listId else { return nil }
  return loadAllLists().first { $0.id == listId }
}

func loadLegacyPayload() -> LegacyPayload? {
  guard
    let defaults = UserDefaults(suiteName: appGroupID),
    let json = defaults.string(forKey: legacyDataKey),
    let data = json.data(using: .utf8),
    let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let listName = root["listName"] as? String,
    let rawItems = root["items"] as? [[String: Any]]
  else { return nil }
  let items = rawItems.compactMap { WidgetItem(from: $0) }
  let lastUpdated = root["lastUpdated"] as? Int ?? 0
  return LegacyPayload(listName: listName, items: items, lastUpdated: lastUpdated)
}

// MARK: - Timeline Entry

struct CartaraIQWidgetEntry: TimelineEntry {
  let date: Date
  let listName: String
  let items: [WidgetItem]
  let hasData: Bool
}

// MARK: - AppIntent: List Picker

struct ShoppingListEntity: AppEntity {
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Shopping List")
  static var defaultQuery = ShoppingListQuery()

  var id: String
  var name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

struct ShoppingListQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [ShoppingListEntity] {
    let allLists = loadAllLists()
    return identifiers.compactMap { id in
      guard let list = allLists.first(where: { $0.id == id }) else { return nil }
      return ShoppingListEntity(id: list.id, name: list.name)
    }
  }

  func suggestedEntities() async throws -> [ShoppingListEntity] {
    loadAllLists().map { ShoppingListEntity(id: $0.id, name: $0.name) }
  }

  func defaultResult() async -> ShoppingListEntity? {
    guard let first = loadAllLists().first else { return nil }
    return ShoppingListEntity(id: first.id, name: first.name)
  }
}

struct SelectListIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Select Shopping List"
  static var description: IntentDescription = IntentDescription("Choose which shopping list to display.")

  @Parameter(title: "Shopping List")
  var shoppingList: ShoppingListEntity?
}

// MARK: - Timeline Provider

struct CartaraIQWidgetProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> CartaraIQWidgetEntry {
    CartaraIQWidgetEntry(
      date: Date(),
      listName: "Weekly Shop",
      items: [
        WidgetItem(id: "1", name: "Milk", quantity: 1, unit: "L", checked: 0),
        WidgetItem(id: "2", name: "Eggs", quantity: 12, unit: nil, checked: 0),
        WidgetItem(id: "3", name: "Bread", quantity: 1, unit: nil, checked: 1),
      ],
      hasData: true
    )
  }

  func snapshot(for configuration: SelectListIntent, in context: Context) async -> CartaraIQWidgetEntry {
    makeEntry(for: configuration)
  }

  func timeline(for configuration: SelectListIntent, in context: Context) async -> Timeline<CartaraIQWidgetEntry> {
    let entry = makeEntry(for: configuration)
    let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
    return Timeline(entries: [entry], policy: .after(nextUpdate))
  }

  private func makeEntry(for configuration: SelectListIntent) -> CartaraIQWidgetEntry {
    // 1. Use the user-selected list if available
    if let selectedList = configuration.shoppingList,
       let listData = loadListById(selectedList.id) {
      return CartaraIQWidgetEntry(
        date: Date(),
        listName: listData.name,
        items: listData.items,
        hasData: true
      )
    }
    // 2. Fallback: first list from all-lists data
    if let first = loadAllLists().first {
      return CartaraIQWidgetEntry(
        date: Date(),
        listName: first.name,
        items: first.items,
        hasData: true
      )
    }
    // 3. Fallback: legacy single-list data
    if let legacy = loadLegacyPayload() {
      return CartaraIQWidgetEntry(
        date: Date(),
        listName: legacy.listName,
        items: legacy.items,
        hasData: true
      )
    }
    // 4. No data yet
    return CartaraIQWidgetEntry(date: Date(), listName: "CartaraIQ", items: [], hasData: false)
  }
}

// MARK: - Views

struct CartaraIQWidgetEntryView: View {
  var entry: CartaraIQWidgetEntry
  @Environment(\.widgetFamily) var family

  var unchecked: [WidgetItem] {
    entry.items.filter { $0.checked == 0 }
  }
  var checkedCount: Int {
    entry.items.filter { $0.checked == 1 }.count
  }
  var totalCount: Int { entry.items.count }

  var visibleItems: [WidgetItem] {
    let limit = family == .systemSmall ? 3 : 5
    return Array(unchecked.prefix(limit))
  }
  var remainingCount: Int { max(0, unchecked.count - visibleItems.count) }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {

      // Header row: app name top-left, count top-right
      HStack(alignment: .top, spacing: 0) {
        HStack(spacing: 0) {
          Text("Cartara")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(Color(red: 0.310, green: 0.722, blue: 0.784)) // tealLight #4FB8C8
          Text("IQ")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(Color(red: 0.961, green: 0.784, blue: 0.259)) // amber #F5C842
        }
        Spacer()
        if totalCount > 0 {
          Text("\(checkedCount)/\(totalCount)")
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(Color.white.opacity(0.8))
        }
      }

      // List name
      Text(entry.listName)
        .font(.system(size: 15, weight: .bold))
        .foregroundColor(.white)
        .lineLimit(1)
        .padding(.top, 2)
        .padding(.bottom, 4)

      if visibleItems.isEmpty {
        Spacer()
        HStack {
          Spacer()
          if !entry.hasData {
            Text("Open CartaraIQ\nto load your list")
              .font(.system(size: 14))
              .foregroundColor(Color.white.opacity(0.6))
              .multilineTextAlignment(.center)
          } else {
            Label("All done!", systemImage: "checkmark.circle.fill")
              .font(.system(size: 15, weight: .medium))
              .foregroundColor(Color.white.opacity(0.8))
          }
          Spacer()
        }
        Spacer()
      } else {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(visibleItems) { item in
            ItemRowView(item: item)
          }
          if remainingCount > 0 {
            Text("+\(remainingCount) more")
              .font(.system(size: 12))
              .foregroundColor(Color.white.opacity(0.55))
              .padding(.top, 1)
          }
        }
        Spacer(minLength: 0)
      }
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 16)
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
        .frame(width: 12, height: 12)
      Text(item.name)
        .font(.system(size: 15, weight: .medium))
        .foregroundColor(.white)
        .lineLimit(1)
      Spacer()
      if let qty = quantityLabel {
        Text(qty)
          .font(.system(size: 13))
          .foregroundColor(Color.white.opacity(0.6))
      }
    }
  }
}

// MARK: - Widget Entry Point

@main
struct CartaraIQWidget: Widget {
  let kind: String = "CartaraIQWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: SelectListIntent.self, provider: CartaraIQWidgetProvider()) { entry in
      CartaraIQWidgetEntryView(entry: entry)
        .containerBackground(Color(red: 0.106, green: 0.420, blue: 0.475), for: .widget)
    }
    .contentMarginsDisabled()
    .configurationDisplayName("Shopping List")
    .description("Choose a list and see your items at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
