/**
 * Tests for useLoyaltyPrograms hook
 */
import { renderHook } from "@testing-library/react-native";
import { useLoyaltyPrograms } from "../../hooks/useLoyaltyPrograms";

// Mock the context
jest.mock("../../contexts/LoyaltyProgramsContext", () => ({
  useLoyaltyProgramsContext: () => ({
    programs: [
      {
        id: "1",
        name: "Tesco",
        slug: "tesco",
        logo_url: "url1",
        logo_background: "#fff",
        detection_rules: { prefixes: ["5"], lengths: [13], symbology: ["EAN-13"] },
        is_active: true,
        sort_order: 1,
        updated_at: "2026-03-09",
      },
      {
        id: "2",
        name: "Boots",
        slug: "boots",
        logo_url: "url2",
        logo_background: "#fff",
        detection_rules: { prefixes: ["4"], lengths: [13], symbology: ["EAN-13"] },
        is_active: true,
        sort_order: 2,
        updated_at: "2026-03-09",
      },
    ],
    loading: false,
    error: null,
  }),
}));

describe("useLoyaltyPrograms", () => {
  it("returns loyalty programs from context", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    expect(result.current.programs).toBeTruthy();
    expect(Array.isArray(result.current.programs)).toBe(true);
  });

  it("returns programs array with correct length", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    expect(result.current.programs.length).toBe(2);
  });

  it("returns programs with all required properties", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const program = result.current.programs[0];
    expect(program).toHaveProperty("id");
    expect(program).toHaveProperty("name");
    expect(program).toHaveProperty("slug");
    expect(program).toHaveProperty("logo_url");
    expect(program).toHaveProperty("detection_rules");
  });

  it("can find program by id", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const program = result.current.programs.find(p => p.id === "1");
    expect(program?.name).toBe("Tesco");
  });

  it("can find program by slug", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const program = result.current.programs.find(p => p.slug === "tesco");
    expect(program?.id).toBe("1");
  });

  it("returns correct program properties", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const tesco = result.current.programs[0];
    expect(tesco.name).toBe("Tesco");
    expect(tesco.slug).toBe("tesco");
    expect(tesco.is_active).toBe(true);
  });

  it("includes detection rules for each program", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    result.current.programs.forEach(program => {
      expect(program.detection_rules).toBeDefined();
      expect(program.detection_rules.prefixes).toBeDefined();
      expect(Array.isArray(program.detection_rules.prefixes)).toBe(true);
    });
  });

  it("handles multiple program lookups", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const tesco = result.current.programs.find(p => p.id === "1");
    const boots = result.current.programs.find(p => p.id === "2");
    expect(tesco?.name).toBe("Tesco");
    expect(boots?.name).toBe("Boots");
  });

  it("maintains program list consistency", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const initialLength = result.current.programs.length;
    expect(initialLength).toBe(2);
    // Verify list hasn't changed
    expect(result.current.programs.length).toBe(initialLength);
  });

  it("returns programs in sorted order", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const sortOrders = result.current.programs.map(p => p.sort_order);
    for (let i = 1; i < sortOrders.length; i++) {
      expect(sortOrders[i] >= sortOrders[i - 1]).toBe(true);
    }
  });

  it("handles searching across all programs", () => {
    const { result } = renderHook(() => useLoyaltyPrograms());
    const searchResults = result.current.programs.filter(p =>
      p.name.toLowerCase().includes("boot")
    );
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].name).toBe("Boots");
  });
});
