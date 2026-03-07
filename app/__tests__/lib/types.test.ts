import type { ListItem, Suggestion, ShoppingList } from "../lib/types";

describe("lib/types", () => {
  describe("ListItem", () => {
    it("should allow creating a valid ListItem", () => {
      const item: ListItem = {
        id: "1",
        name: "Milk",
        quantity: 2,
        unit: "bottles",
        checked: 0,
        sort_order: 1,
        times_added: 5,
      };

      expect(item.id).toBe("1");
      expect(item.name).toBe("Milk");
      expect(item.quantity).toBe(2);
      expect(item.unit).toBe("bottles");
      expect(item.checked).toBe(0);
      expect(item.sort_order).toBe(1);
      expect(item.times_added).toBe(5);
    });

    it("should allow checked value of 0 (unchecked), 1 (checked), or 2 (deleted)", () => {
      const unchecked: ListItem = {
        id: "1",
        name: "A",
        quantity: 1,
        unit: null,
        checked: 0,
        sort_order: 0,
        times_added: 0,
      };
      const checked: ListItem = {
        id: "2",
        name: "B",
        quantity: 1,
        unit: null,
        checked: 1,
        sort_order: 0,
        times_added: 0,
      };
      const deleted: ListItem = {
        id: "3",
        name: "C",
        quantity: 1,
        unit: null,
        checked: 2,
        sort_order: 0,
        times_added: 0,
      };

      expect(unchecked.checked).toBe(0);
      expect(checked.checked).toBe(1);
      expect(deleted.checked).toBe(2);
    });
  });

  describe("Suggestion", () => {
    it("should allow creating a valid Suggestion", () => {
      const suggestion: Suggestion = {
        name: "Eggs",
        reason: "Often bought with milk",
      };

      expect(suggestion.name).toBe("Eggs");
      expect(suggestion.reason).toBe("Often bought with milk");
    });
  });

  describe("ShoppingList", () => {
    it("should allow creating a valid ShoppingList", () => {
      const list: ShoppingList = {
        id: "list-1",
        name: "Weekly Groceries",
      };

      expect(list.id).toBe("list-1");
      expect(list.name).toBe("Weekly Groceries");
    });
  });
});
