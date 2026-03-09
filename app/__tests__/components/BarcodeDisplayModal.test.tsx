import React from "react";
import { render } from "@testing-library/react-native";
import { BarcodeDisplayModal } from "../../components/BarcodeDisplayModal";
import { useLoyaltyPrograms } from "../../hooks/useLoyaltyPrograms";

jest.mock("../../hooks/useLoyaltyPrograms", () => ({
  useLoyaltyPrograms: jest.fn(),
}));

const mockUseLoyaltyPrograms = useLoyaltyPrograms as jest.Mock;

const mockCard = {
  id: "test-card-1",
  barcode: "1234567890128",
  name: "Coffee House",
  color: "#1B6B7A",
  createdAt: "2024-01-01T00:00:00.000Z",
  programId: undefined as string | undefined,
};

const mockOnClose = jest.fn();
const mockOnEdit = jest.fn();
const mockOnDelete = jest.fn();

describe("BarcodeDisplayModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [],
      loading: false,
      refresh: jest.fn(),
    });
  });

  it("renders without crashing when hidden", () => {
    expect(() =>
      render(
        <BarcodeDisplayModal
          visible={false}
          card={mockCard}
          onClose={mockOnClose}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      )
    ).not.toThrow();
  });

  it("renders when visible with a valid barcode", () => {
    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders branded background when program has logo_url", () => {
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [
        {
          id: "loyalty-prog-1",
          slug: "loyalty-prog-1",
          name: "Coffee House",
          logo_url: "https://example.com/logo.png",
          logo_background: "#FFFFFF",
        },
      ],
      loading: false,
      refresh: jest.fn(),
    });

    const brandedCard = {
      ...mockCard,
      programId: "loyalty-prog-1",
    };

    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={brandedCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders program matched by slug", () => {
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [
        {
          id: "some-other-id",
          slug: "loyalty-slug-1",
          name: "Grocery Store",
          logo_url: "https://example.com/logo2.png",
          logo_background: "#000000",
        },
      ],
      loading: false,
      refresh: jest.fn(),
    });

    const slugCard = {
      ...mockCard,
      programId: "loyalty-slug-1",
    };

    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={slugCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders card without programId (gradient background)", () => {
    const unlinkedCard = { ...mockCard, programId: undefined };

    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={unlinkedCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });

  it("handles barcode generation failure gracefully", () => {
    // Empty barcode string causes JsBarcode to throw, exercising the catch branch
    const brokenCard = {
      ...mockCard,
      barcode: "",
    };

    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={brokenCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders program without logo_url (gradient fallback)", () => {
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [
        {
          id: "no-logo-prog",
          slug: "no-logo-prog",
          name: "Basic Store",
          logo_url: null,
          logo_background: null,
        },
      ],
      loading: false,
      refresh: jest.fn(),
    });

    const noLogoCard = {
      ...mockCard,
      programId: "no-logo-prog",
    };

    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={noLogoCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });

  it("renders branded card with null logo_background uses transparent fallback", () => {
    mockUseLoyaltyPrograms.mockReturnValue({
      programs: [
        {
          id: "no-bg-prog",
          slug: "no-bg-prog",
          name: "No BG Store",
          logo_url: "https://example.com/logo.png",
          logo_background: null,
        },
      ],
      loading: false,
      refresh: jest.fn(),
    });

    const noBgCard = {
      ...mockCard,
      programId: "no-bg-prog",
    };

    const { root } = render(
      <BarcodeDisplayModal
        visible={true}
        card={noBgCard}
        onClose={mockOnClose}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(root).toBeTruthy();
  });
});
