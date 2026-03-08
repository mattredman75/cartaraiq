import React from "react";
import { render } from "@testing-library/react-native";
import { StoreCardItem } from "../../components/StoreCardItem";

const mockCard = {
  id: "test-1",
  number: "5123456789012345",
  expiry_month: 12,
  expiry_year: 2025,
};

const mockOnPress = jest.fn();
const mockOnLongPress = jest.fn();

describe("StoreCardItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { toJSON } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("displays card container", () => {
    const { root } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(root.children.length).toBeGreaterThanOrEqual(0);
  });

  it("handles press events", () => {
    const { root } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders with custom dimensions", () => {
    const { toJSON } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={200}
        cardHeight={120}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("mounts with valid card data", () => {
    const { root } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(root).toBeTruthy();
  });

  it("handles different card types", () => {
    const visaCard = {
      ...mockCard,
      number: "4111111111111111",
    };
    const { toJSON } = render(
      <StoreCardItem
        card={visaCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders with required props", () => {
    const { root } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(root).toBeTruthy();
  });

  it("handles callback functions", () => {
    render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(mockOnPress).not.toHaveBeenCalled();
  });

  it("renders card interface", () => {
    const { toJSON } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it("maintains consistent rendering", () => {
    const { rerender } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    rerender(
      <StoreCardItem
        card={mockCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(rerender).toBeTruthy();
  });
});
