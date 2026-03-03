import SwiftUI

struct SignUpView: View {
    @Environment(AuthViewModel.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var showLogin = false

    var body: some View {
        ZStack {
            Color.surface.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Create account")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.ink)
                        Text("Start your smart shopping journey")
                            .font(.system(size: 16))
                            .foregroundColor(.muted)
                    }
                    .padding(.top, 32)

                    // Fields
                    VStack(spacing: 16) {
                        AuthTextField(
                            placeholder: "Full name",
                            text: $name,
                            textContentType: .name,
                            autocapitalization: .words
                        )
                        AuthTextField(
                            placeholder: "Email",
                            text: $email,
                            keyboardType: .emailAddress,
                            textContentType: .emailAddress
                        )
                        AuthTextField(
                            placeholder: "Password",
                            text: $password,
                            isSecure: true,
                            textContentType: .newPassword
                        )
                    }

                    // Error
                    if let error = auth.errorMessage {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundColor(.danger)
                            .padding(.horizontal, 4)
                    }

                    // Create account button
                    Button(action: {
                        Task { await auth.register(name: name, email: email, password: password) }
                    }) {
                        Group {
                            if auth.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Create Account")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.primaryTeal)
                        .cornerRadius(12)
                    }
                    .disabled(auth.isLoading || name.isEmpty || email.isEmpty || password.isEmpty)
                    .opacity(name.isEmpty || email.isEmpty || password.isEmpty ? 0.6 : 1)

                    // Sign in link
                    HStack {
                        Spacer()
                        Button(action: { showLogin = true }) {
                            Text("Already have an account? ")
                                .foregroundColor(.muted)
                            + Text("Sign in")
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
        .navigationDestination(isPresented: $showLogin) { LoginView() }
    }
}
