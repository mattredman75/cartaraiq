/**
 * Tests for app/index.tsx — root redirect
 */
import React from "react";
import { render } from "@testing-library/react-native";

const mockRedirect = jest.fn(() => null);
jest.mock("expo-router", () => ({
  Redirect: (props: any) => {
    mockRedirect(props);
    return null;
  },
}));

import Index from "../../app/index";

describe("Index (root redirect)", () => {
  it("redirects to /(auth)/welcome", () => {
    render(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/(auth)/welcome" }),
    );
  });
});
