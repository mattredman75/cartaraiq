import Foundation
import WidgetKit

@objc(SharedDataModule)
class SharedDataModule: NSObject {

  private static let appGroupID = "group.com.cartaraiq.app"
  private static let userDefaultsKey = "widgetData"

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

    defaults.set(json, forKey: SharedDataModule.userDefaultsKey)

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }

    resolve(nil)
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
