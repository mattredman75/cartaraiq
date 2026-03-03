import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case put = "PUT"
    case delete = "DELETE"
}

enum APIError: Error, LocalizedError {
    case unauthorized
    case networkError(String)
    case decodingError(String)
    case serverError(Int, String)
    case invalidURL

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Unauthorized. Please sign in again."
        case .networkError(let msg): return msg
        case .decodingError(let msg): return "Failed to parse response: \(msg)"
        case .serverError(let code, let msg): return "Server error \(code): \(msg)"
        case .invalidURL: return "Invalid URL"
        }
    }
}

class APIClient {
    static let shared = APIClient()

    let baseURL: String

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    init() {
        baseURL = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? "https://api.cartaraiq.app"
    }

    func request<T: Decodable>(
        _ endpoint: String,
        method: HTTPMethod = .get,
        body: (any Encodable)? = nil,
        queryItems: [URLQueryItem]? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        guard var components = URLComponents(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }
        if let queryItems {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if requiresAuth, let token = KeychainManager.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError("No HTTP response")
        }

        if httpResponse.statusCode == 401 {
            NotificationCenter.default.post(name: .unauthorized, object: nil)
            throw APIError.unauthorized
        }

        if !(200..<300).contains(httpResponse.statusCode) {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["detail"] ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
            throw APIError.serverError(httpResponse.statusCode, message)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error.localizedDescription)
        }
    }

    func requestVoid(
        _ endpoint: String,
        method: HTTPMethod,
        body: (any Encodable)? = nil,
        queryItems: [URLQueryItem]? = nil,
        requiresAuth: Bool = true
    ) async throws {
        guard var components = URLComponents(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }
        if let queryItems {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if requiresAuth, let token = KeychainManager.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError("No HTTP response")
        }

        if httpResponse.statusCode == 401 {
            NotificationCenter.default.post(name: .unauthorized, object: nil)
            throw APIError.unauthorized
        }

        if !(200..<300).contains(httpResponse.statusCode) {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["detail"] ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
            throw APIError.serverError(httpResponse.statusCode, message)
        }
    }
}

extension Notification.Name {
    static let unauthorized = Notification.Name("unauthorized")
}
