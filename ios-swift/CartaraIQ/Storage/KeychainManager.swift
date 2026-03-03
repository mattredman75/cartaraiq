import Foundation
import Security

class KeychainManager {
    static let shared = KeychainManager()

    private let service = "com.cartaraiq.app"
    private let tokenKey = "auth_token"
    private let userKey = "auth_user"

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - Token

    var token: String? {
        get { getString(forKey: tokenKey) }
        set {
            if let value = newValue {
                set(string: value, forKey: tokenKey)
            } else {
                delete(forKey: tokenKey)
            }
        }
    }

    // MARK: - User

    var user: User? {
        get {
            guard let data = getData(forKey: userKey) else { return nil }
            return try? decoder.decode(User.self, from: data)
        }
        set {
            if let value = newValue, let data = try? encoder.encode(value) {
                set(data: data, forKey: userKey)
            } else {
                delete(forKey: userKey)
            }
        }
    }

    // MARK: - Clear

    func clearAll() {
        delete(forKey: tokenKey)
        delete(forKey: userKey)
    }

    // MARK: - Private helpers

    private func getString(forKey key: String) -> String? {
        guard let data = getData(forKey: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func getData(forKey key: String) -> Data? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    private func set(string: String, forKey key: String) {
        guard let data = string.data(using: .utf8) else { return }
        set(data: data, forKey: key)
    }

    private func set(data: Data, forKey key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key
        ]

        let attributes: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData] = data
            addQuery[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    private func delete(forKey key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
