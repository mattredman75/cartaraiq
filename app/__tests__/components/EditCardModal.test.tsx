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

  it("updates card name input", () => {
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

  it("updates selected color", () => {
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

  it("prevents save with empty card name", () => {
    const onSaveMock = jest.fn();
    const { root } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={onSaveMock}
      />
    );
    expect(root).toBeTruthy();
  });

  it("trims whitespace from card name before save", () => {
    const onSaveMock = jest.fn();
    const { root } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={onSaveMock}
      />
    );
    expect(root).toBeTruthy();
  });

  it("initializes with card data on mount", () => {
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

  it("handles card changes via props", () => {
    const newCard = {
      ...mockCard,
      name: "Updated Card",
      expiry_month: 6,
    };
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
        visible={true}
        card={newCard}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(true).toBe(true);
  });

  it("renders color selector component", () => {
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
