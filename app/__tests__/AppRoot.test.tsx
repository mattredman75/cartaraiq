/**
 * Tests for App.tsx (root fallback component)
 */
import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

import App from "../App";

describe("App", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<App />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders the starter text", () => {
    const { getByText } = render(<App />);
    expect(getByText(/Open up App\.tsx/)).toBeTruthy();
  });
});
