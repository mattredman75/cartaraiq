import Foundation
import Observation

@Observable
class AuthViewModel {
    var user: User? = nil
    var isLoading = false
    var errorMessage: String? = nil

    var isAuthenticated: Bool { user != nil }

    init() {
        user = KeychainManager.shared.user
        // Listen for 401 unauthorized to auto sign-out
        NotificationCenter.default.addObserver(
            forName: .unauthorized,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.signOut()
        }
    }

    @MainActor
    func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await CartaraIQ.login(email: email, password: password)
            KeychainManager.shared.token = response.accessToken
            KeychainManager.shared.user = response.user
            user = response.user
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    func register(name: String, email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let response = try await CartaraIQ.register(name: name, email: email, password: password)
            KeychainManager.shared.token = response.accessToken
            KeychainManager.shared.user = response.user
            user = response.user
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    func forgotPassword(email: String) async throws {
        try await CartaraIQ.forgotPassword(email: email)
    }

    @MainActor
    func resetPassword(email: String, code: String, newPassword: String) async throws {
        try await CartaraIQ.resetPassword(email: email, code: code, newPassword: newPassword)
    }

    @MainActor
    func updateName(_ name: String) async {
        isLoading = true
        errorMessage = nil
        do {
            let updatedUser = try await CartaraIQ.updateMe(name: name)
            KeychainManager.shared.user = updatedUser
            user = updatedUser
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func signOut() {
        KeychainManager.shared.clearAll()
        user = nil
        errorMessage = nil
    }
}
