import SwiftUI

struct ForgotPasswordView: View {
    @Environment(AuthViewModel.self) private var auth

    @State private var email = ""
    @State private var codeSent = false
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var showResetPassword = false

    var body: some View {
        ZStack {
            Color.surface.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 24) {
                if codeSent {
                    // Success state
                    VStack(alignment: .leading, spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.success.opacity(0.12))
                                .frame(width: 72, height: 72)
                            Image(systemName: "envelope.circle.fill")
                                .font(.system(size: 36))
                                .foregroundColor(.success)
                        }
                        .padding(.top, 32)

                        Text("Check your email")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.ink)

                        Text("We sent a reset code to \(email). Enter it on the next screen.")
                            .font(.system(size: 16))
                            .foregroundColor(.muted)
                            .lineSpacing(4)

                        Button(action: { showResetPassword = true }) {
                            Text("Enter reset code")
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
                    // Email input state
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Forgot password?")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.ink)
                            .padding(.top, 32)

                        Text("Enter your email and we'll send you a reset code.")
                            .font(.system(size: 16))
                            .foregroundColor(.muted)
                    }

                    AuthTextField(
                        placeholder: "Email",
                        text: $email,
                        keyboardType: .emailAddress,
                        textContentType: .emailAddress
                    )

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundColor(.danger)
                    }

                    Button(action: sendCode) {
                        Group {
                            if isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Send Reset Code")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.primaryTeal)
                        .cornerRadius(12)
                    }
                    .disabled(isLoading || email.isEmpty)
                    .opacity(email.isEmpty ? 0.6 : 1)
                }

                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResetPassword) {
            ResetPasswordView(email: email)
        }
    }

    private func sendCode() {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await auth.forgotPassword(email: email)
                await MainActor.run { codeSent = true }
            } catch {
                await MainActor.run { errorMessage = error.localizedDescription }
            }
            await MainActor.run { isLoading = false }
        }
    }
}
