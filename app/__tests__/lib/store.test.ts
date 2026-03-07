import { useAuthStore, useListStore } from "../../lib/store";

describe("lib/store", () => {
  describe("useAuthStore", () => {
    beforeEach(() => {
      // Reset store to initial state
      useAuthStore.setState({ token: null, user: null });
    });

    it("should start with null token and null user", () => {
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });

    it("setAuth should set token and user", () => {
      const mockUser = { id: "1", name: "Jane", email: "jane@example.com" };
      useAuthStore.getState().setAuth("jwt-token-123", mockUser);

      const state = useAuthStore.getState();
      expect(state.token).toBe("jwt-token-123");
      expect(state.user).toEqual(mockUser);
    });

    it("clearAuth should reset token and user to null", () => {
      useAuthStore
        .getState()
        .setAuth("some-token", { id: "1", name: "X", email: "x@x.com" });
      useAuthStore.getState().clearAuth();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
    });

    it("updateUser should merge partial user data", () => {
      useAuthStore
        .getState()
        .setAuth("token", { id: "1", name: "Old Name", email: "a@b.com" });
      useAuthStore.getState().updateUser({ name: "New Name" });

      const { user } = useAuthStore.getState();
      expect(user?.name).toBe("New Name");
      expect(user?.email).toBe("a@b.com"); // unchanged
    });

    it("updateUser should be a no-op when user is null", () => {
      useAuthStore.getState().updateUser({ name: "Ignored" });
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("useListStore", () => {
    beforeEach(() => {
      useListStore.setState({ currentList: null });
    });

    it("should start with null currentList", () => {
      expect(useListStore.getState().currentList).toBeNull();
    });

    it("setCurrentList should update currentList", () => {
      const list = { id: "list-1", name: "Groceries" };
      useListStore.getState().setCurrentList(list);

      expect(useListStore.getState().currentList).toEqual(list);
    });

    it("setCurrentList with null should clear currentList", () => {
      useListStore.getState().setCurrentList({ id: "list-1", name: "Test" });
      useListStore.getState().setCurrentList(null);

      expect(useListStore.getState().currentList).toBeNull();
    });
  });
});
