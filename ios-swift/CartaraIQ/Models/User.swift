import Foundation

struct User: Codable, Equatable {
    let id: String
    var name: String
    let email: String
}

struct LoginResponse: Codable {
    let accessToken: String
    let user: User
}
