/**
 * Tests for Pantry screen
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import PantryScreen from "../../app/(app)/pantry";

// Mock storage
jest.mock("../../lib/storage", () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  deleteItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

describe("PantryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<PantryScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("displays Loyalty Cards title", async () => {
    const { getByText } = render(<PantryScreen />);
    await waitFor(() => {
      expect(getByText("Loyalty Cards")).toBeTruthy();
    });
  });

  it("displays Add Card button", async () => {
    const { getByText } = render(<PantryScreen />);
    await waitFor(() => {
      expect(getByText("Add new card")).toBeTruthy();
    });
  });
});
