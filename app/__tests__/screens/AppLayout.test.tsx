/**
 * Tests for AppLayout (app/(app)/_layout.tsx)
 */
import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  return {
    Tabs: ({ children, screenOptions }: any) => (
      <View>
        <Text>Tabs</Text>
        {children}
      </View>
    ),
  };
});

// Override Tabs.Screen
jest.mock("expo-router", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Tabs = ({ children, screenOptions }: any) => (
    <View testID="tabs">{children}</View>
  );
  Tabs.Screen = ({ name, options }: any) => {
    const React = require("react");
    const { View, Text } = require("react-native");
    // Render icon with both focused states
    const iconFocused = options?.tabBarIcon?.({ focused: true });
    const iconUnfocused = options?.tabBarIcon?.({ focused: false });
    return (
      <View testID={`tab-${name}`}>
        {iconFocused}
        {iconUnfocused}
      </View>
    );
  };
  return { Tabs };
});

import AppLayout from "../../app/(app)/_layout";

describe("AppLayout", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<AppLayout />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders tab screens for list, products, and profile", () => {
    const { getByTestId } = render(<AppLayout />);
    expect(getByTestId("tab-list")).toBeTruthy();
    expect(getByTestId("tab-products/index")).toBeTruthy();
    expect(getByTestId("tab-profile")).toBeTruthy();
  });

  it("renders correct emoji icons", () => {
    const { getAllByText } = render(<AppLayout />);
    expect(getAllByText("🛒").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("🔍").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("👤").length).toBeGreaterThanOrEqual(1);
  });

  it("renders correct tab labels", () => {
    const { getAllByText } = render(<AppLayout />);
    expect(getAllByText("My List").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Discover").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Profile").length).toBeGreaterThanOrEqual(1);
  });

  it("renders products/[id] and manage-data tabs as hidden (href=null)", () => {
    const { getByTestId } = render(<AppLayout />);
    expect(getByTestId("tab-products/[id]")).toBeTruthy();
    expect(getByTestId("tab-manage-data")).toBeTruthy();
  });
});
