/**
 * Tests for Pantry screen
 */
import React from "react";
import { render } from "@testing-library/react-native";
import PantryScreen from "../../app/(app)/pantry";

describe("PantryScreen", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<PantryScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("displays the pantry icon", () => {
    const { getByText } = render(<PantryScreen />);
    expect(getByText("📚")).toBeTruthy();
  });

  it("displays the pantry title", () => {
    const { getByText } = render(<PantryScreen />);
    expect(getByText("Pantry")).toBeTruthy();
  });

  it("displays coming soon subtitle", () => {
    const { getByText } = render(<PantryScreen />);
    expect(getByText("Coming soon")).toBeTruthy();
  });

  it("displays description text", () => {
    const { getByText } = render(<PantryScreen />);
    expect(
      getByText("Track ingredients you have at home and manage your kitchen inventory.")
    ).toBeTruthy();
  });
});
