/**
 * theme.tsx — Prescriptive tests
 *
 * The theme module MUST:
 * 1. Default to system preference when no saved value
 * 2. Restore saved theme from localStorage ("light" or "dark")
 * 3. Ignore invalid saved values and fall back to system preference
 * 4. Toggle between dark and light
 * 5. Persist theme to localStorage on change
 * 6. Add/remove "dark" class on document.documentElement
 * 7. Throw when useTheme is called outside ThemeProvider
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../lib/theme";

function ThemeConsumer() {
  const { theme, toggle } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle}>Toggle</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    localStorage.clear();
    // Re-establish matchMedia mock — vi.restoreAllMocks() clears
    // the setup.ts vi.fn() implementation between tests
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as any;
  });

  describe("initialization", () => {
    it("defaults to light when system preference is light and no saved value", () => {
      // matchMedia mock returns false for prefers-color-scheme: dark (set in setup.ts)
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("theme").textContent).toBe("light");
    });

    it("defaults to dark when system prefers dark", () => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query) =>
          ({
            matches: query === "(prefers-color-scheme: dark)",
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as any,
      );

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("theme").textContent).toBe("dark");
    });

    it("restores 'dark' from localStorage", () => {
      localStorage.setItem("admin_theme", "dark");
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("theme").textContent).toBe("dark");
    });

    it("restores 'light' from localStorage", () => {
      localStorage.setItem("admin_theme", "light");
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("theme").textContent).toBe("light");
    });

    it("ignores invalid saved values and falls back to system preference", () => {
      localStorage.setItem("admin_theme", "purple");
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      // System preference is light (matchMedia mock returns false)
      expect(screen.getByTestId("theme").textContent).toBe("light");
    });
  });

  describe("toggle", () => {
    it("switches from light to dark", () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("theme").textContent).toBe("light");

      act(() => {
        screen.getByText("Toggle").click();
      });
      expect(screen.getByTestId("theme").textContent).toBe("dark");
    });

    it("switches from dark back to light", () => {
      localStorage.setItem("admin_theme", "dark");
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );

      act(() => {
        screen.getByText("Toggle").click();
      });
      expect(screen.getByTestId("theme").textContent).toBe("light");
    });
  });

  describe("side effects", () => {
    it("persists theme to localStorage", () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(localStorage.getItem("admin_theme")).toBe("light");

      act(() => {
        screen.getByText("Toggle").click();
      });
      expect(localStorage.getItem("admin_theme")).toBe("dark");
    });

    it("adds 'dark' class to documentElement when dark theme is active", () => {
      localStorage.setItem("admin_theme", "dark");
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("removes 'dark' class when switching to light", () => {
      localStorage.setItem("admin_theme", "dark");
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>,
      );
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      act(() => {
        screen.getByText("Toggle").click();
      });
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("useTheme — context guard", () => {
    it("throws when used outside ThemeProvider", () => {
      const Orphan = () => {
        useTheme();
        return null;
      };
      expect(() => render(<Orphan />)).toThrow(
        "useTheme must be used within ThemeProvider",
      );
    });
  });
});
