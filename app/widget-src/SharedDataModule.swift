import Foundation
import WidgetKit

// Define RN promise types so this file compiles without a bridging header import
typealias RCTPromiseResolveBlock = (Any?) -> Void
typealias RCTPromiseRejectBlock = (String?, String?, Error?) -> Void

@objc(SharedDataModule)
class SharedDataModule: NSObject {

  private static let appGroupID = "group.com.cartaraiq.app"
  private static let widgetDataKey = "widgetData"
  private static let allListsKey = "widgetAllLists"
  private static let maintenanceKey = "widgetMaintenance"

  /// Write the current list + items JSON to the shared App Group UserDefaults,
  /// then ask WidgetKit to reload all widget timelines.
  @objc func syncToWidget(_ listName: String,
                           items: [[String: Any]],
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: SharedDataModule.appGroupID) else {
      reject("APP_GROUP_ERROR", "Could not open App Group UserDefaults", nil)
      return
    }

    let payload: [String: Any] = [
      "listName": listName,
      "items": items,
      "lastUpdated": Int(Date().timeIntervalSince1970)
    ]

    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else {
      reject("SERIALISATION_ERROR", "Could not serialise widget data", nil)
      return
    }

    defaults.set(json, forKey: SharedDataModule.widgetDataKey)
    defaults.synchronize()

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolve(nil)
  }

  /// Write all lists with their items to the shared App Group UserDefaults.
  /// Each list entry contains { id, name, items[] }.
  /// Lists with empty items[] are kept as-is from previous syncs (merge strategy).
  @objc func syncAllListsToWidget(_ lists: [[String: Any]],
                                    resolver resolve: @escaping RCTPromiseResolveBlock,
                                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: SharedDataModule.appGroupID) else {
      reject("APP_GROUP_ERROR", "Could not open App Group UserDefaults", nil)
      return
    }

    // Load existing data so we can merge items for lists not currently viewed
    var existingListItems: [String: [[String: Any]]] = [:]
    if let existingJson = defaults.string(forKey: SharedDataModule.allListsKey),
       let existingData = existingJson.data(using: .utf8),
       let existingPayload = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any],
       let existingLists = existingPayload["lists"] as? [[String: Any]] {
      for list in existingLists {
        if let id = list["id"] as? String,
           let items = list["items"] as? [[String: Any]],
           !items.isEmpty {
          existingListItems[id] = items
        }
      }
    }

    // Merge: use new items if provided, otherwise keep existing items
    let mergedLists: [[String: Any]] = lists.map { list in
      var merged = list
      let id = list["id"] as? String ?? ""
      let items = list["items"] as? [[String: Any]] ?? []
      if items.isEmpty, let existing = existingListItems[id] {
        merged["items"] = existing
      }
      return merged
    }

    let payload: [String: Any] = [
      "lists": mergedLists,
      "lastUpdated": Int(Date().timeIntervalSince1970)
    ]

    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else {
      reject("SERIALISATION_ERROR", "Could not serialise all-lists data", nil)
      return
    }

    defaults.set(json, forKey: SharedDataModule.allListsKey)
    defaults.synchronize()

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolve(nil)
  }

  /// Write the maintenance mode flag to shared App Group UserDefaults,
  /// then ask WidgetKit to reload all widget timelines.
  @objc func syncMaintenanceToWidget(_ maintenance: Bool,
                                      message: String,
                                      resolver resolve: @escaping RCTPromiseResolveBlock,
                                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: SharedDataModule.appGroupID) else {
      reject("APP_GROUP_ERROR", "Could not open App Group UserDefaults", nil)
      return
    }

    let payload: [String: Any] = [
      "maintenance": maintenance,
      "message": message,
      "lastUpdated": Int(Date().timeIntervalSince1970)
    ]

    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else {
      reject("SERIALISATION_ERROR", "Could not serialise maintenance data", nil)
      return
    }

    defaults.set(json, forKey: SharedDataModule.maintenanceKey)
    defaults.synchronize()

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolve(nil)
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
