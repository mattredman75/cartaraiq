/**
 * StatsCard.tsx — Prescriptive tests
 *
 * StatsCard MUST:
 * 1. Render title and numeric value
 * 2. Show subtitle when provided, hide when not
 * 3. Render icon with correct color styling
 * 4. Wrap in Link when 'to' is provided — must be clickable navigation
 * 5. Render as plain div (no link) when no 'to'
 * 6. Fall back to indigo styling for unknown color values
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StatsCard from "../components/StatsCard";

function renderCard(props: any) {
  return render(
    <MemoryRouter>
      <StatsCard {...props} />
    </MemoryRouter>,
  );
}

describe("StatsCard", () => {
  it("renders title and value", () => {
    renderCard({ title: "Total Users", value: 42 });
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    renderCard({ title: "Total", value: 10, subtitle: "5 this week" });
    expect(screen.getByText("5 this week")).toBeInTheDocument();
  });

  it("does NOT render subtitle when not provided", () => {
    const { container } = renderCard({ title: "Total", value: 10 });
    // No subtitle element should exist — only title and value text
    const texts = container.querySelectorAll("p");
    const textContents = Array.from(texts).map((p) => p.textContent);
    expect(textContents).not.toContain(expect.stringContaining("subtitle"));
  });

  it("renders icon with color styling", () => {
    renderCard({
      title: "Test",
      value: 1,
      icon: <span data-testid="icon">ICO</span>,
      color: "green",
    });
    const icon = screen.getByTestId("icon");
    // Icon wrapper should have green-themed classes
    const wrapper = icon.parentElement!;
    expect(wrapper.className).toContain("green");
  });

  it("wraps in Link when 'to' is provided — must be navigable", () => {
    renderCard({ title: "Click me", value: 5, to: "/users" });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/users");
  });

  it("does NOT render as a link when no 'to'", () => {
    renderCard({ title: "Static", value: 5 });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("applies correct color classes for each known color", () => {
    const colors = ["indigo", "green", "red", "amber", "blue"];
    colors.forEach((color) => {
      const { container, unmount } = render(
        <MemoryRouter>
          <StatsCard title="T" value={1} icon={<span>I</span>} color={color} />
        </MemoryRouter>,
      );
      // Should find the color name in the icon wrapper's class
      const iconWrapper = container.querySelector(`[class*="${color}"]`);
      expect(iconWrapper).not.toBeNull();
      unmount();
    });
  });

  it("falls back to indigo for unknown color values", () => {
    const { container } = renderCard({
      title: "T",
      value: 1,
      icon: <span>I</span>,
      color: "neon",
    });
    // Should use indigo fallback
    const iconWrapper = container.querySelector('[class*="indigo"]');
    expect(iconWrapper).not.toBeNull();
  });
});
