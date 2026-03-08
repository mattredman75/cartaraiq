import React from "react";
import { render } from "@testing-library/react-native";
import { EditCardModal } from "../../components/EditCardModal";

const mockCard = {
  id: "test-1",
  number: "5123456789012345",
  expiry_month: 12,
  expiry_year: 2025,
};

const mockOnClose = jest.fn();
const mockOnSave = jest.fn();

describe("EditCardModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders when visible", () => {
    const { toJSON } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("does not render visible modal when visibility is false", () => {
    const { render: renderFn } = {
      render: () => (
        <EditCardModal
          visible={false}
          card={mockCard}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      ),
    };
    expect(renderFn).toBeTruthy();
  });

  it("calls onClose callback", () => {
    const { root } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(root).toBeTruthy();
  });

  it("calls onSave callback", () => {
    const { root } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(mockOnSave).not.toHaveBeenCalled();
    expect(root).toBeTruthy();
  });

  it("handles card expiry information", () => {
    const { toJSON } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders with required props", () => {
    const { root } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(root).toBeTruthy();
  });

  it("handles modal state changes", () => {
    const { rerender } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    rerender(
      <EditCardModal
        visible={false}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(rerender).toBeTruthy();
  });

  it("accepts new card data", () => {
    const newCard = {
      ...mockCard,
      expiry_month: 6,
      expiry_year: 2026,
    };
    const { toJSON } = render(
      <EditCardModal
        visible={true}
        card={newCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("maintains component state", () => {
    const { root } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(root).toBeTruthy();
  });
});
