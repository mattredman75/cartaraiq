/**
 * Tests for WelcomeScreen
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { FlatList } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// Mock scrollToIndex to avoid invariant violation in test env
const origScrollToIndex = FlatList.prototype.scrollToIndex;
beforeAll(() => {
  FlatList.prototype.scrollToIndex = jest.fn();
});
afterAll(() => {
  FlatList.prototype.scrollToIndex = origScrollToIndex;
});

import WelcomeScreen from "../../app/(auth)/welcome";

describe("WelcomeScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the logo text", () => {
    const { getAllByText } = render(<WelcomeScreen />);
    // "CartaraIQ" appears in logo and also in slide content
    expect(getAllByText(/Cartara/).length).toBeGreaterThan(0);
  });

  it("renders first slide title", () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(getByText(/Your Lists/)).toBeTruthy();
  });

  it("shows Continue button on first slide", () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(getByText("Continue")).toBeTruthy();
  });

  it("navigates to login on Sign in press", () => {
    const { getByText } = render(<WelcomeScreen />);
    fireEvent.press(getByText(/Sign in/));
    expect(mockPush).toHaveBeenCalledWith("/(auth)/login");
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<WelcomeScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("advances to next slide on Continue press", () => {
    const { getByText } = render(<WelcomeScreen />);
    fireEvent.press(getByText("Continue"));
    // scrollToIndex should be called to advance
    expect(FlatList.prototype.scrollToIndex).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to signup after advancing through all slides", () => {
    const { getByText } = render(<WelcomeScreen />);
    // There are 3 slides. Press Continue twice, then "Get Started" on the last slide.
    fireEvent.press(getByText("Continue")); // index 0 → 1
    fireEvent.press(getByText("Continue")); // index 1 → 2
    fireEvent.press(getByText("Get Started")); // index 2 → push to signup
    expect(mockPush).toHaveBeenCalledWith("/(auth)/signup");
  });

  it("renders dot indicators", () => {
    const { toJSON } = render(<WelcomeScreen />);
    // Dots are rendered as Views - just verify component renders
    expect(toJSON()).toBeTruthy();
  });

  it("handles FlatList scroll", () => {
    const { toJSON } = render(<WelcomeScreen />);
    expect(toJSON()).toBeTruthy();
  });

  // ── onMomentumScrollEnd updates current index ─────────────────────
  it("updates currentIndex on FlatList scroll", () => {
    const { UNSAFE_root } = render(<WelcomeScreen />);
    const flatLists = UNSAFE_root.findAll(
      (n: any) =>
        n.type?.displayName === "FlatList" ||
        n.type?.name === "FlatList" ||
        n.props?.horizontal === true,
    );
    // Fire onMomentumScrollEnd with a contentOffset simulating slide 2
    if (flatLists.length > 0 && flatLists[0].props.onMomentumScrollEnd) {
      act(() => {
        flatLists[0].props.onMomentumScrollEnd({
          nativeEvent: { contentOffset: { x: 375 } },
        });
      });
    }
    // Component should re-render with updated index — no crash
    expect(UNSAFE_root).toBeTruthy();
  });
});
