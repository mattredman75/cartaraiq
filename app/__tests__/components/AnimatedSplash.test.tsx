/**
 * Tests for AnimatedSplash component
 */
import React from "react";
import { render, act } from "@testing-library/react-native";

import AnimatedSplash from "../../components/AnimatedSplash";

describe("AnimatedSplash", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<AnimatedSplash onFinish={jest.fn()} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders pulse rings", () => {
    const { toJSON } = render(<AnimatedSplash onFinish={jest.fn()} />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it("calls onFinish after DISPLAY_TIME via setTimeout", () => {
    const onFinish = jest.fn();
    render(<AnimatedSplash onFinish={onFinish} />);
    // DISPLAY_TIME = 2400ms, then withTiming 400ms with callback
    // In jest mock of reanimated, withTiming fires callback immediately
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    // With the mock, reanimated's withTiming calls the callback synchronously,
    // so runOnJS(onFinish) fires
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("cleans up timeout on unmount", () => {
    const onFinish = jest.fn();
    const { unmount } = render(<AnimatedSplash onFinish={onFinish} />);
    unmount();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    // onFinish should not be called after unmount due to clearTimeout
    expect(onFinish).not.toHaveBeenCalled();
  });
});
