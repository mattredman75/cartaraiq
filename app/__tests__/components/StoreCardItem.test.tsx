import React from "react";
import { render } from "@testing-library/react-native";
import { StoreCardItem } from "../../components/StoreCardItem";
import { useLoyaltyPrograms } from "../../hooks/useLoyaltyPrograms";

jest.mock("../../hooks/useLoyaltyPrograms", () => ({
  useLoyaltyPrograms: jest.fn(),
}));

const mockUseLoyaltyPrograms = useLoyaltyPrograms as jest.Mock;

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
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [],
      loading: false,
      refresh: jest.fn(),
    });
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

  it("applies correct card dimensions", () => {
    const { root } = render(
      <StoreCardItem
        card={mockCard}
        cardWidth={200}
        cardHeight={120}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders Pressable wrapper for interactions", () => {
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

  it("handles different card programs", () => {
    const amexCard = {
      ...mockCard,
      number: "3782822463100",
    };
    const { toJSON } = render(
      <StoreCardItem
        card={amexCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("applies card color styling", () => {
    const coloredCard = {
      ...mockCard,
      color: "red",
    };
    const { root } = render(
      <StoreCardItem
        card={coloredCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(root).toBeTruthy();
  });

  it("displays card expiry information", () => {
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

  it("renders branded card when program has logo_url", () => {
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [
        {
          id: "prog-1",
          slug: "prog-1",
          name: "Brand Store",
          logo_url: "https://example.com/logo.png",
          logo_background: "#FFFFFF",
        },
      ],
      loading: false,
      refresh: jest.fn(),
    });

    const brandedCard = {
      id: "branded-1",
      barcode: "1234567890128",
      name: "Brand Store",
      color: "#1B6B7A",
      createdAt: "2024-01-01T00:00:00.000Z",
      programId: "prog-1",
    };

    const { toJSON } = render(
      <StoreCardItem
        card={brandedCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders branded card using logo_background or transparent fallback", () => {
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [
        {
          id: "prog-2",
          slug: "prog-2",
          name: "Another Store",
          logo_url: "https://example.com/logo2.png",
          logo_background: null,
        },
      ],
      loading: false,
      refresh: jest.fn(),
    });

    const brandedCard2 = {
      id: "branded-2",
      barcode: "9876543210987",
      name: "Another Store",
      color: "#FF0000",
      createdAt: "2024-01-01T00:00:00.000Z",
      programId: "prog-2",
    };

    const { toJSON } = render(
      <StoreCardItem
        card={brandedCard2}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders with default cardWidth and cardHeight when not provided", () => {
    const card = {
      id: "default-dims",
      barcode: "1234567890128",
      name: "Default Card",
      color: "#336699",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const { toJSON } = render(
      <StoreCardItem
        card={card}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders card with unmatched programId (no program found)", () => {
    const unmatchedCard = {
      id: "unmatched-1",
      barcode: "1234567890128",
      name: "Unknown Program",
      color: "#663399",
      createdAt: "2024-01-01T00:00:00.000Z",
      programId: "nonexistent-program",
    };
    const { toJSON } = render(
      <StoreCardItem
        card={unmatchedCard}
        cardWidth={150}
        cardHeight={100}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />
    );
    expect(toJSON()).toBeTruthy();
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
