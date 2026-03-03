import SwiftUI

struct LoginView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var showForgotPassword = false

    var body: some View {
        ZStack {
            Color.surface.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Welcome back")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.ink)
                        Text("Sign in to your account")
                            .font(.system(size: 16))
                            .foregroundColor(.muted)
                    }
                    .padding(.top, 32)

                    // Fields
                    VStack(spacing: 16) {
                        AuthTextField(placeholder: "Email", text: $email, keyboardType: .emailAddress, textContentType: .emailAddress)
                        AuthTextField(placeholder: "Password", text: $password, isSecure: true, textContentType: .password)
                    }

                    // Forgot password
                    HStack {
                        Spacer()
                        Button("Forgot password?") { showForgotPassword = true }
                            .font(.system(size: 14))
                            .foregroundColor(.primaryTeal)
                    }

                    // Error
                    if let error = auth.errorMessage {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundColor(.danger)
                            .padding(.horizontal, 4)
                    }

                    // Sign in button
                    Button(action: {
                        Task { await auth.login(email: email, password: password) }
                    }) {
                        Group {
                            if auth.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Sign In")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.primaryTeal)
                        .cornerRadius(12)
                    }
                    .disabled(auth.isLoading || email.isEmpty || password.isEmpty)
                    .opacity(email.isEmpty || password.isEmpty ? 0.6 : 1)

                    // Sign up link
                    HStack {
                        Spacer()
                        Button(action: { dismiss() }) {
                            Text("Don't have an account? ")
                                .foregroundColor(.muted)
                            + Text("Sign up")
                                .foregroundColor(.primaryTeal)
                        }
                        .font(.system(size: 14))
                        Spacer()
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showForgotPassword) { ForgotPasswordView() }
    }
}

// MARK: - Shared text field

struct AuthTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var isSecure: Bool = false
    var textContentType: UITextContentType? = nil
    var autocapitalization: TextInputAutocapitalization = .never

    var body: some View {
        Group {
            if isSecure {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocapitalization)
            }
        }
        .textContentType(textContentType)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.card)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.border, lineWidth: 1)
        )
        .font(.system(size: 15))
        .foregroundColor(.ink)
    }
}
