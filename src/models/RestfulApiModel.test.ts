import { describe, it, beforeEach, expect, afterEach, vi } from "vitest";

import { RestfulApiModel, Fetcher } from "./RestfulApiModel";
import { z } from "zod";
import { first, skip } from "rxjs/operators";
import { ZodError } from "zod/v4";

// Define a simple Zod schema for testing
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

describe("RestfulApiModel", () => {
  const baseUrl = "https://api.test.com";
  // @ts-ignore
  let mockFetcher: vi.Mock<ReturnType<Fetcher>>;
  const endpoint = "users";
  let model: RestfulApiModel<User | User[], typeof UserSchema>;

  beforeEach(() => {
    mockFetcher = vi.fn();
    model = new RestfulApiModel<User | User[], typeof UserSchema>(
      baseUrl,
      endpoint,
      mockFetcher,
      UserSchema
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize correctly with base properties", async () => {
    expect(await model.data$.pipe(first()).toPromise()).toBeNull();
    expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
    expect(await model.error$.pipe(first()).toPromise()).toBeNull();
  });

  it("should throw error if baseUrl, endpoint, or fetcher are missing", () => {
    // @ts-ignore
    expect(
      () => new RestfulApiModel(null, endpoint, mockFetcher, UserSchema)
    ).toThrow("RestfulApiModel requires baseUrl, endpoint, and fetcher.");
    // @ts-ignore
    expect(
      () => new RestfulApiModel(baseUrl, null, mockFetcher, UserSchema)
    ).toThrow("RestfulApiModel requires baseUrl, endpoint, and fetcher.");
    // @ts-ignore
    expect(
      () => new RestfulApiModel(baseUrl, endpoint, null, UserSchema)
    ).toThrow("RestfulApiModel requires baseUrl, endpoint, and fetcher.");
  });

  describe("fetch method", () => {
    it.skip("should fetch a collection of users and update data$", async () => {
      const users: User[] = [
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
      ];
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(users),
        headers: new Headers({ "Content-Type": "application/json" }),
      } as Response);

      const dataPromise = model.data$.pipe(skip(1), first()).toPromise(); // Skip initial null
      const loadingPromises = [
        model.isLoading$.pipe(first()).toPromise(), // Initial false
        model.isLoading$.pipe(skip(1), first()).toPromise(), // true during fetch
        model.isLoading$.pipe(skip(2), first()).toPromise(), // false after fetch
      ];

      await model.fetch();

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}`, {
        method: "GET",
      });
      expect(await dataPromise).toEqual(users);
      expect(await Promise.all(loadingPromises)).toEqual([false, true, false]);
      expect(await model.error$.pipe(first()).toPromise()).toBeNull();
    });

    it("should fetch a single user by ID and update data$", async () => {
      const user: User = { id: "1", name: "Alice", email: "alice@example.com" };
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(user),
        headers: new Headers({ "Content-Type": "application/json" }),
      } as Response);

      await model.fetch("1");

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}/1`, {
        method: "GET",
      });
      expect(await model.data$.pipe(first()).toPromise()).toEqual(user);
    });

    it("should set error$ if fetch fails", async () => {
      const fetchError = new Error("Network error");
      mockFetcher.mockRejectedValue(fetchError);

      await model.fetch();

      expect(await model.error$.pipe(first()).toPromise()).toBe(fetchError);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false); // Loading should be false after error
    });

    it("should throw ZodError if fetched data is invalid", async () => {
      const invalidData = [{ id: "1", name: "Alice", email: "invalid-email" }]; // invalid email
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(invalidData),
        headers: new Headers({ "Content-Type": "application/json" }),
      } as Response);

      await model.fetch();

      const error = await model.error$.pipe(first()).toPromise();
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as ZodError).issues[0].code).toContain("invalid_type");
      expect(await model.data$.pipe(first()).toPromise()).toBeNull(); // Data should not be set
    });
  });

  describe("create method", () => {
    const newUser: User = {
      id: "3",
      name: "Charlie",
      email: "charlie@example.com",
    };
    const payload: Partial<User> = {
      name: "Charlie",
      email: "charlie@example.com",
    };

    beforeEach(() => {
      // Set initial data as a collection for testing create/update/delete on collections
      model.setData([
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
      ]);
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(newUser),
        headers: new Headers({ "Content-Type": "application/json" }),
      } as Response);
    });

    it("should create a new user and add to data$ collection", async () => {
      await model.create(payload);

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const currentData = await model.data$.pipe(first()).toPromise();
      expect(currentData).toEqual([
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
        newUser,
      ]);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
      expect(await model.error$.pipe(first()).toPromise()).toBeNull();
    });

    it("should replace data$ if it was a single item", async () => {
      const singleItemModel = new RestfulApiModel<User, typeof UserSchema>(
        baseUrl,
        endpoint,
        mockFetcher,
        UserSchema,
        { id: "initial", name: "Initial", email: "initial@test.com" }
      );
      await singleItemModel.create(payload);
      expect(await singleItemModel.data$.pipe(first()).toPromise()).toEqual(
        newUser
      );
      singleItemModel.dispose(); // Clean up model created in test
    });

    it("should set error$ if create fails", async () => {
      const createError = new Error("Creation failed");
      mockFetcher.mockRejectedValue(createError);

      await model.create(payload);

      expect(await model.error$.pipe(first()).toPromise()).toBe(createError);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
    });
  });

  describe("update method", () => {
    const updatedUser: User = {
      id: "1",
      name: "Alice Updated",
      email: "alice.updated@example.com",
    };
    const payload: Partial<User> = {
      name: "Alice Updated",
      email: "alice.updated@example.com",
    };

    beforeEach(() => {
      model.setData([
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
      ]);
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(updatedUser),
        headers: new Headers({ "Content-Type": "application/json" }),
      } as Response);
    });

    it("should update an existing user in data$ collection", async () => {
      await model.update("1", payload);

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}/1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const currentData = await model.data$.pipe(first()).toPromise();
      expect(currentData).toEqual([
        updatedUser,
        { id: "2", name: "Bob", email: "bob@example.com" },
      ]);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
      expect(await model.error$.pipe(first()).toPromise()).toBeNull();
    });

    it("should replace data$ if it was a single item", async () => {
      const singleItemModel = new RestfulApiModel<User, typeof UserSchema>(
        baseUrl,
        endpoint,
        mockFetcher,
        UserSchema,
        { id: "1", name: "Alice", email: "alice@example.com" }
      );
      await singleItemModel.update("1", payload);
      expect(await singleItemModel.data$.pipe(first()).toPromise()).toEqual(
        updatedUser
      );
      singleItemModel.dispose();
    });

    it("should set error$ if update fails", async () => {
      const updateError = new Error("Update failed");
      mockFetcher.mockRejectedValue(updateError);

      await model.update("1", payload);

      expect(await model.error$.pipe(first()).toPromise()).toBe(updateError);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
    });
  });

  describe("delete method", () => {
    beforeEach(() => {
      model.setData([
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
      ]);
      mockFetcher.mockResolvedValue({ status: 204 } as Response); // Mock successful deletion with 204 No Content
    });

    it("should delete a user from data$ collection", async () => {
      await model.delete("1");

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}/1`, {
        method: "DELETE",
      });
      const currentData = await model.data$.pipe(first()).toPromise();
      expect(currentData).toEqual([
        { id: "2", name: "Bob", email: "bob@example.com" },
      ]);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
      expect(await model.error$.pipe(first()).toPromise()).toBeNull();
    });

    it("should set data$ to null if it was a single item and that item is deleted", async () => {
      const singleItemModel = new RestfulApiModel<User, typeof UserSchema>(
        baseUrl,
        endpoint,
        mockFetcher,
        UserSchema,
        { id: "1", name: "Alice", email: "alice@example.com" }
      );
      await singleItemModel.delete("1");
      expect(await singleItemModel.data$.pipe(first()).toPromise()).toBeNull();
      singleItemModel.dispose();
    });

    it("should set error$ if delete fails", async () => {
      const deleteError = new Error("Deletion failed");
      mockFetcher.mockRejectedValue(deleteError);

      await model.delete("1");

      expect(await model.error$.pipe(first()).toPromise()).toBe(deleteError);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
    });
  });
});
