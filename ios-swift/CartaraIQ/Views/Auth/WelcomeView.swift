import SwiftUI

private struct Slide: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let emoji: String
    let accentColor: Color
}

private let slides: [Slide] = [
    Slide(
        title: "Shop Smarter,\nNot Harder",
        subtitle: "CartaraIQ learns what you buy and when — so your list is ready before you even open the app.",
        emoji: "🛒",
        accentColor: .cyanAccent
    ),
    Slide(
        title: "Predictive\nShopping Lists",
        subtitle: "Running low on milk? We already know. AI tracks your patterns and surfaces the right items at the right time.",
        emoji: "🤖",
        accentColor: .amberAccent
    ),
    Slide(
        title: "Discover What\nYou'll Love",
        subtitle: "Get AI-powered product recommendations tailored to your tastes, budget, and shopping habits.",
        emoji: "✨",
        accentColor: .tealLight
    )
]

struct WelcomeView: View {
    @State private var currentIndex = 0
    @State private var showSignUp = false
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.primaryTealDark.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Logo
                    HStack {
                        Text("Cartara")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)
                        + Text("IQ")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.cyanAccent)
                        Spacer()
                    }
                    .padding(.horizontal, 28)
                    .padding(.top, 16)

                    // Slides
                    TabView(selection: $currentIndex) {
                        ForEach(Array(slides.enumerated()), id: \.element.id) { idx, slide in
                            SlideView(slide: slide)
                                .tag(idx)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .animation(.easeInOut, value: currentIndex)

                    // Bottom controls
                    VStack(spacing: 0) {
                        // Dots
                        HStack(spacing: 8) {
                            ForEach(0..<slides.count, id: \.self) { i in
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(i == currentIndex ? Color.cyanAccent : Color.white.opacity(0.3))
                                    .frame(width: i == currentIndex ? 28 : 8, height: 6)
                                    .animation(.easeInOut(duration: 0.25), value: currentIndex)
                            }
                        }
                        .padding(.bottom, 32)

                        // CTA
                        Button(action: goNext) {
                            Text(currentIndex < slides.count - 1 ? "Continue" : "Get Started")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.primaryTealDark)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 18)
                                .background(Color.cyanAccent)
                                .cornerRadius(16)
                        }
                        .padding(.bottom, 16)

                        Button(action: { showLogin = true }) {
                            Text("Already have an account? ")
                                .foregroundColor(Color.white.opacity(0.6))
                            + Text("Sign in")
                                .foregroundColor(.cyanAccent)
                        }
                        .font(.system(size: 14))
                    }
                    .padding(.horizontal, 28)
                    .padding(.bottom, 36)
                }
            }
            .navigationDestination(isPresented: $showSignUp) { SignUpView() }
            .navigationDestination(isPresented: $showLogin) { LoginView() }
        }
    }

    private func goNext() {
        if currentIndex < slides.count - 1 {
            withAnimation { currentIndex += 1 }
        } else {
            showSignUp = true
        }
    }
}

private struct SlideView: View {
    let slide: Slide

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Icon card
            ZStack {
                RoundedRectangle(cornerRadius: 28)
                    .fill(Color.white.opacity(0.12))
                    .frame(width: 96, height: 96)
                Text(slide.emoji)
                    .font(.system(size: 42))
            }
            .padding(.bottom, 40)

            Text(slide.title)
                .font(.system(size: 36, weight: .bold))
                .foregroundColor(.white)
                .lineSpacing(4)
                .padding(.bottom, 20)

            Text(slide.subtitle)
                .font(.system(size: 16))
                .foregroundColor(Color.white.opacity(0.7))
                .lineSpacing(8)

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 28)
        .padding(.top, 60)
    }
}
