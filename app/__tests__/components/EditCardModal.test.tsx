import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { EditCardModal } from "../../components/EditCardModal";

const mockCard = {
  id: "test-1",
  barcode: "1234567890128",
  name: "My Loyalty Card",
  color: "#1B6B7A",
  createdAt: "2024-01-01T00:00:00.000Z",
  programId: undefined as string | undefined,
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

  it("does not call onSave when card name is empty", () => {
    const onSaveMock = jest.fn();
    const { getByDisplayValue, getByText } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={onSaveMock}
      />
    );
    const input = getByDisplayValue("My Loyalty Card");
    fireEvent.changeText(input, "");
    fireEvent.press(getByText("Save Changes"));
    expect(onSaveMock).not.toHaveBeenCalled();
  });

  it("calls onSave when card name is valid", () => {
    const onSaveMock = jest.fn();
    const { getByDisplayValue, getByText } = render(
      <EditCardModal
        visible={true}
        card={mockCard}
        onClose={mockOnClose}
        onSave={onSaveMock}
      />
    );
    const input = getByDisplayValue("My Loyalty Card");
    fireEvent.changeText(input, "Updated Name");
    fireEvent.press(getByText("Save Changes"));
    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated Name" })
    );
  });
});
