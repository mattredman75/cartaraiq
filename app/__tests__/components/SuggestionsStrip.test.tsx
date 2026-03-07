/**
 * Tests for SuggestionsStrip component
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { SuggestionsStrip } from "../../components/SuggestionsStrip";

const suggestions = [
  { name: "Bananas", reason: "Bought them often", _type: "prediction" },
  { name: "Pasta Bake", reason: "Based on your items", _type: "recipe" },
];

const baseProps = {
  allSuggestions: suggestions,
  onAdd: jest.fn(),
  onDismiss: jest.fn(),
};

describe("SuggestionsStrip", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when no suggestions", () => {
    const { toJSON } = render(
      <SuggestionsStrip {...baseProps} allSuggestions={[]} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders AI SUGGESTIONS label", () => {
    const { getByText } = render(<SuggestionsStrip {...baseProps} />);
    expect(getByText("AI SUGGESTIONS")).toBeTruthy();
  });

  it("renders suggestion names", () => {
    const { getByText } = render(<SuggestionsStrip {...baseProps} />);
    expect(getByText("Bananas")).toBeTruthy();
    expect(getByText("Pasta Bake")).toBeTruthy();
  });

  it("renders suggestion reasons", () => {
    const { getByText } = render(<SuggestionsStrip {...baseProps} />);
    expect(getByText("Bought them often")).toBeTruthy();
  });

  it("calls onAdd with name and type when + Add pressed", () => {
    const onAdd = jest.fn();
    const { getAllByText } = render(
      <SuggestionsStrip {...baseProps} onAdd={onAdd} />,
    );
    const addButtons = getAllByText("+ Add");
    fireEvent.press(addButtons[0]);
    expect(onAdd).toHaveBeenCalledWith("Bananas", "prediction");
  });

  it("calls onDismiss with name when ✕ pressed", () => {
    const onDismiss = jest.fn();
    const { getAllByText } = render(
      <SuggestionsStrip {...baseProps} onDismiss={onDismiss} />,
    );
    const dismissButtons = getAllByText("✕");
    fireEvent.press(dismissButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith("Bananas");
  });

  it("renders refresh button when onRefresh provided", () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <SuggestionsStrip {...baseProps} onRefresh={onRefresh} />,
    );
    expect(getByText("↻")).toBeTruthy();
  });

  it("calls onRefresh when refresh button pressed", () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <SuggestionsStrip {...baseProps} onRefresh={onRefresh} />,
    );
    fireEvent.press(getByText("↻"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not render refresh button when onRefresh not provided", () => {
    const { queryByText } = render(<SuggestionsStrip {...baseProps} />);
    expect(queryByText("↻")).toBeNull();
  });

  it("uses custom refreshIcon", () => {
    const { getByText } = render(
      <SuggestionsStrip
        {...baseProps}
        onRefresh={jest.fn()}
        refreshIcon="🔄"
      />,
    );
    expect(getByText("🔄")).toBeTruthy();
  });

  it("renders with isRefreshing=true (animation running)", () => {
    const { getByText } = render(
      <SuggestionsStrip
        {...baseProps}
        onRefresh={jest.fn()}
        isRefreshing={true}
      />,
    );
    expect(getByText("AI SUGGESTIONS")).toBeTruthy();
  });

  it("handles isRefreshing toggle from true to false", () => {
    const { rerender, getByText } = render(
      <SuggestionsStrip
        {...baseProps}
        onRefresh={jest.fn()}
        isRefreshing={true}
      />,
    );
    rerender(
      <SuggestionsStrip
        {...baseProps}
        onRefresh={jest.fn()}
        isRefreshing={false}
      />,
    );
    expect(getByText("AI SUGGESTIONS")).toBeTruthy();
  });
});
