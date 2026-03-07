/**
 * Tests for ProductDetailScreen (app/(app)/products/[id].tsx)
 */
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.spyOn(Alert, "alert");

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "p1" }),
}));

let mockProduct: any = null;
let mockProductLoading = false;
const mockFetchProduct = jest.fn();
const mockAddListItemFn = jest.fn().mockResolvedValue(undefined);
const mockInvalidateQueries = jest.fn();

let mockAddMutateFn: jest.Mock;
let mockAddIsPending = false;

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mockProduct,
    isLoading: mockProductLoading,
  }),
  useMutation: ({ mutationFn, onSuccess }: any) => {
    mockAddMutateFn = jest.fn(async () => {
      await mutationFn();
      if (onSuccess) onSuccess();
    });
    return {
      mutate: mockAddMutateFn,
      isPending: mockAddIsPending,
    };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock("../../lib/api", () => ({
  fetchProduct: (...args: any[]) => mockFetchProduct(...args),
  addListItem: (...args: any[]) => mockAddListItemFn(...args),
}));

import ProductDetailScreen from "../../app/(app)/products/[id]";

describe("ProductDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProduct = null;
    mockProductLoading = false;
    mockAddIsPending = false;
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<ProductDetailScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("shows loading indicator when loading", () => {
    mockProductLoading = true;
    const { queryByText } = render(<ProductDetailScreen />);
    expect(queryByText("Product not found")).toBeNull();
    expect(queryByText("+ Add to Shopping List")).toBeNull();
  });

  it("shows Product not found when no product", () => {
    mockProduct = null;
    mockProductLoading = false;
    const { getByText } = render(<ProductDetailScreen />);
    expect(getByText("Product not found")).toBeTruthy();
  });

  it("renders product details", () => {
    mockProduct = {
      id: "p1",
      name: "Organic Milk",
      brand: "Happy Farms",
      price: 4.99,
      unit: "gallon",
      category: "Dairy",
      emoji: "🥛",
      ai_tag: "Popular",
    };
    const { getByText } = render(<ProductDetailScreen />);
    expect(getByText("Organic Milk")).toBeTruthy();
    expect(getByText("by Happy Farms")).toBeTruthy();
    expect(getByText("$4.99")).toBeTruthy();
    expect(getByText("gallon")).toBeTruthy();
    expect(getByText("Dairy")).toBeTruthy();
    expect(getByText("Popular")).toBeTruthy();
    expect(getByText("🥛")).toBeTruthy();
    expect(getByText("+ Add to Shopping List")).toBeTruthy();
  });

  it("renders info cards with Price, Unit, Category labels", () => {
    mockProduct = {
      id: "p1",
      name: "Eggs",
      brand: "B",
      price: 3.5,
      unit: "dozen",
      category: "Dairy",
      emoji: "🥚",
      ai_tag: "T",
    };
    const { getByText } = render(<ProductDetailScreen />);
    expect(getByText("Price")).toBeTruthy();
    expect(getByText("Unit")).toBeTruthy();
    expect(getByText("Category")).toBeTruthy();
  });

  it("calls addMutation when Add to Shopping List is pressed", async () => {
    mockProduct = {
      id: "p1",
      name: "Milk",
      brand: "B",
      price: 3,
      unit: "gal",
      category: "Dairy",
      emoji: "🥛",
      ai_tag: "T",
    };
    const { getByText } = render(<ProductDetailScreen />);
    await act(async () => {
      fireEvent.press(getByText("+ Add to Shopping List"));
    });
    expect(mockAddMutateFn).toHaveBeenCalled();
  });

  it("navigates back when back button is pressed", () => {
    const { UNSAFE_root } = render(<ProductDetailScreen />);
    // The back button has paddingHorizontal: 24, paddingTop: 8
    const backBtns = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.onPress &&
        node.props?.style?.paddingHorizontal === 24 &&
        node.props?.style?.paddingTop === 8,
    );
    expect(backBtns.length).toBeGreaterThan(0);
    backBtns[0].props.onPress();
    expect(mockBack).toHaveBeenCalled();
  });

  it("calls onSuccess after add mutation (invalidates queries and shows Alert)", async () => {
    mockProduct = {
      id: "p1",
      name: "Milk",
      brand: "B",
      price: 3,
      unit: "gal",
      category: "Dairy",
      emoji: "🥛",
      ai_tag: "T",
    };
    const { getByText } = render(<ProductDetailScreen />);
    await act(async () => {
      fireEvent.press(getByText("+ Add to Shopping List"));
    });
    expect(mockAddMutateFn).toHaveBeenCalled();
    // The useMutation mock calls onSuccess, which should invalidate queries and show Alert
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["list"] });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Added!",
      "Milk added to your list.",
    );
  });
});
