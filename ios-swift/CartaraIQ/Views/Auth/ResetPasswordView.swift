import SwiftUI

struct ResetPasswordView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(\.dismiss) private var dismiss

    let email: String

    @State private var code = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var resetSuccess = false

    var body: some View {
        ZStack {
            Color.surface.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 24) {
                if resetSuccess {
                    // Success state
                    VStack(alignment: .leading, spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.success.opacity(0.12))
                                .frame(width: 72, height: 72)
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 36))
                                .foregroundColor(.success)
                        }
                        .padding(.top, 32)

                        Text("Password updated!")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.ink)

                        Text("Your password has been reset. Sign in with your new password.")
                            .font(.system(size: 16))
                            .foregroundColor(.muted)
                            .lineSpacing(4)

                        Button(action: { dismiss() }) {
                            Text("Sign In")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color.primaryTeal)
                                .cornerRadius(12)
                        }
                        .padding(.top, 8)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Reset password")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.ink)
                            .padding(.top, 32)
                        Text("Enter the code from your email and choose a new password.")
                            .font(.system(size: 16))
                            .foregroundColor(.muted)
                    }

                    VStack(spacing: 16) {
                        AuthTextField(
                            placeholder: "Reset code",
                            text: $code,
                            keyboardType: .numberPad,
                            textContentType: .oneTimeCode
                        )
                        AuthTextField(
                            placeholder: "New password",
                            text: $newPassword,
                            isSecure: true,
                            textContentType: .newPassword
                        )
                        AuthTextField(
                            placeholder: "Confirm new password",
                            text: $confirmPassword,
                            isSecure: true,
                            textContentType: .newPassword
                        )
                    }

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundColor(.danger)
                    }

                    Button(action: resetPassword) {
                        Group {
                            if isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Reset Password")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.primaryTeal)
                        .cornerRadius(12)
                    }
                    .disabled(isLoading || code.isEmpty || newPassword.isEmpty || confirmPassword.isEmpty)
                    .opacity(code.isEmpty || newPassword.isEmpty || confirmPassword.isEmpty ? 0.6 : 1)
                }

                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func resetPassword() {
        guard newPassword == confirmPassword else {
            errorMessage = "Passwords don't match"
            return
        }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await auth.resetPassword(email: email, code: code, newPassword: newPassword)
                await MainActor.run { resetSuccess = true }
            } catch {
                await MainActor.run { errorMessage = error.localizedDescription }
            }
            await MainActor.run { isLoading = false }
        }
    }
}
