/**
 * Tests for ProductsScreen (app/(app)/products/index.tsx)
 */
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

let mockProducts: any[] = [];
let mockIsLoading = false;
const mockSearchProducts = jest.fn();
jest.mock("../../lib/api", () => ({
  searchProducts: (...args: any[]) => mockSearchProducts(...args),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn, queryKey }: any) => {
    // Execute queryFn synchronously in test if products are pre-set
    return {
      data: mockProducts,
      isLoading: mockIsLoading,
    };
  },
}));

import ProductsScreen from "../../app/(app)/products/index";

describe("ProductsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProducts = [];
    mockIsLoading = false;
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<ProductsScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders Discover header", () => {
    const { getByText } = render(<ProductsScreen />);
    expect(getByText("Discover")).toBeTruthy();
  });

  it("renders search input", () => {
    const { getByPlaceholderText } = render(<ProductsScreen />);
    expect(getByPlaceholderText("Search products...")).toBeTruthy();
  });

  it("renders category pills", () => {
    const { getByText } = render(<ProductsScreen />);
    expect(getByText("All")).toBeTruthy();
    expect(getByText("Produce")).toBeTruthy();
    expect(getByText("Dairy")).toBeTruthy();
    expect(getByText("Meat")).toBeTruthy();
    expect(getByText("Bakery")).toBeTruthy();
    expect(getByText("Pantry")).toBeTruthy();
    expect(getByText("Beverages")).toBeTruthy();
  });

  it("shows No results found when products is empty", () => {
    mockProducts = [];
    const { getByText } = render(<ProductsScreen />);
    expect(getByText("No results found")).toBeTruthy();
  });

  it("renders product cards when products exist", () => {
    mockProducts = [
      {
        id: "p1",
        name: "Organic Milk",
        brand: "Happy Farms",
        price: 4.99,
        unit: "gallon",
        category: "Dairy",
        emoji: "🥛",
        ai_tag: "Popular",
      },
    ];
    const { getByText } = render(<ProductsScreen />);
    expect(getByText("Organic Milk")).toBeTruthy();
    expect(getByText("Happy Farms")).toBeTruthy();
    expect(getByText("$4.99")).toBeTruthy();
    expect(getByText("gallon")).toBeTruthy();
    expect(getByText("Popular")).toBeTruthy();
  });

  it("shows product count", () => {
    mockProducts = [
      {
        id: "p1",
        name: "Milk",
        brand: "B",
        price: 1,
        unit: "ea",
        category: "Dairy",
        emoji: "🥛",
        ai_tag: "T",
      },
      {
        id: "p2",
        name: "Eggs",
        brand: "B",
        price: 2,
        unit: "dz",
        category: "Dairy",
        emoji: "🥚",
        ai_tag: "T",
      },
    ];
    const { getByText } = render(<ProductsScreen />);
    expect(getByText("2 PRODUCTS")).toBeTruthy();
  });

  it("filters by category when pill is pressed", () => {
    mockProducts = [
      {
        id: "p1",
        name: "Apple",
        brand: "B",
        price: 1,
        unit: "lb",
        category: "Produce",
        emoji: "🍎",
        ai_tag: "T",
      },
      {
        id: "p2",
        name: "Milk",
        brand: "B",
        price: 3,
        unit: "gal",
        category: "Dairy",
        emoji: "🥛",
        ai_tag: "T",
      },
    ];
    const { getByText, queryByText } = render(<ProductsScreen />);
    fireEvent.press(getByText("Produce"));
    expect(getByText("Apple")).toBeTruthy();
    expect(queryByText("Milk")).toBeNull();
    expect(getByText("1 PRODUCTS")).toBeTruthy();
  });

  it("navigates to product detail when card is pressed", () => {
    mockProducts = [
      {
        id: "p1",
        name: "Apple",
        brand: "B",
        price: 1,
        unit: "lb",
        category: "Produce",
        emoji: "🍎",
        ai_tag: "T",
      },
    ];
    const { getByText } = render(<ProductsScreen />);
    fireEvent.press(getByText("Apple"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/products/p1");
  });

  it("clears search when X is pressed", () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <ProductsScreen />,
    );
    const input = getByPlaceholderText("Search products...");
    fireEvent.changeText(input, "milk");
    // The ✕ button should appear
    fireEvent.press(getByText("✕"));
    // The input should be empty now
    // The ✕ button should disappear
    expect(queryByText("✕")).toBeNull();
  });

  it("shows loading spinner when isLoading is true", () => {
    mockIsLoading = true;
    const { queryByText } = render(<ProductsScreen />);
    // ActivityIndicator is rendered, no "No results found"
    expect(queryByText("No results found")).toBeNull();
  });

  it("shows all products when All category is selected", () => {
    mockProducts = [
      {
        id: "p1",
        name: "Apple",
        brand: "B",
        price: 1,
        unit: "lb",
        category: "Produce",
        emoji: "🍎",
        ai_tag: "T",
      },
      {
        id: "p2",
        name: "Milk",
        brand: "B",
        price: 3,
        unit: "gal",
        category: "Dairy",
        emoji: "🥛",
        ai_tag: "T",
      },
    ];
    const { getByText } = render(<ProductsScreen />);
    // First filter to Produce
    fireEvent.press(getByText("Produce"));
    // Then switch back to All
    fireEvent.press(getByText("All"));
    expect(getByText("Apple")).toBeTruthy();
    expect(getByText("Milk")).toBeTruthy();
    expect(getByText("2 PRODUCTS")).toBeTruthy();
  });
});
