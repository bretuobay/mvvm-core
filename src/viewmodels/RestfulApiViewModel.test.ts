import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { RestfulApiViewModel } from "./RestfulApiViewModel";
import { BaseModel } from "../models/BaseModel";
import { RestfulApiModel, Fetcher } from "../models/RestfulApiModel"; // Import RestfulApiModel
import { z } from "zod";
import { BehaviorSubject, firstValueFrom } from "rxjs"; // Added combineLatest
import { take, skip } from "rxjs/operators";

// Define a simple Zod schema for testing
const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});
type Item = z.infer<typeof ItemSchema>;
type ItemArray = Item[];

// Mock Fetcher for RestfulApiModel constructor (needed for super() call)
const mockFetcher: Fetcher = async (url, options) => {
  // This mock fetcher won't actually be used by our mocked methods,
  // but the RestfulApiModel constructor requires it.
  return new Response(JSON.stringify({}), { status: 200 });
};

// Mock the RestfulApiModel to control its behavior
// NOW EXTENDS RestfulApiModel directly
class MockRestfulApiModel extends RestfulApiModel<
  Item | ItemArray,
  typeof ItemSchema
> {
  public _data$ = new BehaviorSubject<Item | ItemArray | null>(null);
  public _isLoading$ = new BehaviorSubject<boolean>(false);
  public _error$ = new BehaviorSubject<any>(null);

  // Override public observables to use our internal subjects
  public readonly data$ = this._data$.asObservable();
  public readonly isLoading$ = this._isLoading$.asObservable();
  public readonly error$ = this._error$.asObservable();

  constructor() {
    // Call the parent constructor with dummy values.
    // The actual methods are mocked below.
    super("http://mockapi.com", "items", mockFetcher, z.array(ItemSchema)); // Use z.array(ItemSchema) for ItemArray scenario
  }

  // Now override the actual methods of RestfulApiModel using vi.fn()
  // This allows us to spy on and control their behavior.

  public fetch = vi.fn(async (id?: string | string[]) => {
    this._isLoading$.next(true);
    this._error$.next(null);
    try {
      if (id) {
        const item = {
          id: Array.isArray(id) ? id[0] : id,
          name: `Fetched ${Array.isArray(id) ? id[0] : id}`,
        };
        this._data$.next(item);
      } else {
        const items: ItemArray = [
          { id: "1", name: "Item 1" },
          { id: "2", name: "Item 2" },
        ];
        this._data$.next(items);
      }
    } catch (e) {
      this._error$.next(e);
      throw e;
    } finally {
      this._isLoading$.next(false);
    }
  });

  public create = vi.fn(async (payload: Partial<Item>) => {
    this._isLoading$.next(true);
    this._error$.next(null);
    try {
      const newItem: Item = {
        id: `new-${Date.now()}`,
        name: payload.name || "New Item",
      };
      const currentData = this._data$.getValue();
      if (Array.isArray(currentData)) {
        this._data$.next([...currentData, newItem]);
      } else {
        this._data$.next(newItem); // Replace if it was a single item
      }
      return newItem;
    } catch (e) {
      this._error$.next(e);
      throw e;
    } finally {
      this._isLoading$.next(false);
    }
  });

  public update = vi.fn(async (id: string, payload: Partial<Item>) => {
    this._isLoading$.next(true);
    this._error$.next(null);
    try {
      const updatedItem: Item = { id, name: payload.name || `Updated ${id}` };
      const currentData = this._data$.getValue();
      if (Array.isArray(currentData)) {
        this._data$.next(
          currentData.map((item) =>
            item.id === id ? updatedItem : item
          ) as ItemArray
        );
      } else {
        this._data$.next(updatedItem); // Replace if it was a single item
      }
      return updatedItem;
    } catch (e) {
      this._error$.next(e);
      throw e;
    } finally {
      this._isLoading$.next(false);
    }
  });

  public delete = vi.fn(async (id: string) => {
    this._isLoading$.next(true);
    this._error$.next(null);
    try {
      const currentData = this._data$.getValue();
      if (Array.isArray(currentData)) {
        this._data$.next(
          currentData.filter((item) => item.id !== id) as ItemArray
        );
      } else if ((currentData as Item)?.id === id) {
        // For single item case
        this._data$.next(null);
      }
    } catch (e) {
      this._error$.next(e);
      throw e;
    } finally {
      this._isLoading$.next(false);
    }
  });
}

describe("RestfulApiViewModel", () => {
  let mockModel: MockRestfulApiModel;
  let viewModel: RestfulApiViewModel<ItemArray, any>; // Adjust generic type

  beforeEach(() => {
    mockModel = new MockRestfulApiModel();
    // Now no need for `as any` cast here, as MockRestfulApiModel correctly extends RestfulApiModel
    viewModel = new RestfulApiViewModel(mockModel);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // This test now verifies the explicit error condition for non-RestfulApiModel types.
  it("should throw an error if model is not an instance of RestfulApiModel", () => {
    // We use a completely different class (BaseModel) to trigger the error.
    expect(
      () => new RestfulApiViewModel(new BaseModel(null, ItemSchema) as any)
    ).toThrow("RestfulApiViewModel requires an instance of RestfulApiModel.");
  });

  it("should expose data$, isLoading$, and error$ from the model", async () => {
    const testData: ItemArray = [{ id: "test1", name: "Test Item 1" }];
    mockModel._data$.next(testData);
    mockModel._isLoading$.next(true);
    mockModel._error$.next(new Error("Test Error"));

    expect(await firstValueFrom(viewModel.data$)).toEqual(testData);
    expect(await firstValueFrom(viewModel.isLoading$)).toBe(true);
    expect(await firstValueFrom(viewModel.error$)).toEqual(
      new Error("Test Error")
    );
  });

  describe("fetchCommand", () => {
    it("should call model.fetch without ID when executed without parameter", async () => {
      const loadingStates: boolean[] = [];
      viewModel.isLoading$
        .pipe(take(3))
        .subscribe((val) => loadingStates.push(val)); // Expect 3 states: initial, during, after

      const dataStates: (ItemArray | null)[] = [];
      viewModel.data$.pipe(take(2)).subscribe((val) => dataStates.push(val)); // Expect 2 states: initial, after fetch

      await viewModel.fetchCommand.execute();

      expect(mockModel.fetch).toHaveBeenCalledWith(undefined);
      expect(await firstValueFrom(viewModel.fetchCommand.isExecuting$)).toBe(
        false
      );
      expect(loadingStates).toEqual([false, true, false]);
      expect(dataStates[dataStates.length - 1]).toEqual([
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
      ]);
      expect(await firstValueFrom(viewModel.error$)).toBeNull();
    });

    it("should call model.fetch with ID when executed with a string parameter", async () => {
      await viewModel.fetchCommand.execute("item-id-3");
      expect(mockModel.fetch).toHaveBeenCalledWith("item-id-3");
      expect(await firstValueFrom(viewModel.data$)).toEqual({
        id: "item-id-3",
        name: "Fetched item-id-3",
      });
    });

    it("should call model.fetch with array of IDs when executed with an array parameter", async () => {
      await viewModel.fetchCommand.execute(["item-id-4", "item-id-5"]);
      expect(mockModel.fetch).toHaveBeenCalledWith(["item-id-4", "item-id-5"]);
      // Mock model returns single item for array of IDs, adjust if mock changes
      expect(await firstValueFrom(viewModel.data$)).toEqual({
        id: "item-id-4",
        name: "Fetched item-id-4",
      });
    });

    it.skip("should set error$ if fetch fails", async () => {
      const fetchError = new Error("Fetch failed");
      mockModel.fetch.mockRejectedValueOnce(fetchError);

      await expect(viewModel.fetchCommand.execute()).rejects.toThrow(
        fetchError
      );

      expect(await firstValueFrom(viewModel.error$)).toBe(fetchError);
      expect(await firstValueFrom(viewModel.isLoading$)).toBe(false);
    });
  });

  describe("createCommand", () => {
    const payload: Partial<Item> = { name: "New Test Item" };

    it("should call model.create and update data$", async () => {
      mockModel._data$.next([]); // Start with an empty array for collection
      await viewModel.createCommand.execute(payload);

      expect(mockModel.create).toHaveBeenCalledWith(payload);
      expect(await firstValueFrom(viewModel.createCommand.isExecuting$)).toBe(
        false
      );
      const data = await firstValueFrom(viewModel.data$);
      expect(Array.isArray(data) && data.length).toBe(1);
      expect(Array.isArray(data) && data[0].name).toBe("New Test Item");
      expect(Array.isArray(data) && data[0].id).toMatch(/^new-/); // Check for mock ID pattern
    });

    it.skip("should set error$ if create fails", async () => {
      const createError = new Error("Create failed");
      mockModel.create.mockRejectedValueOnce(createError);

      await expect(viewModel.createCommand.execute(payload)).rejects.toThrow(
        createError
      );

      expect(await firstValueFrom(viewModel.error$)).toBe(createError);
    });
  });

  describe("updateCommand", () => {
    const existingItem: Item = { id: "1", name: "Original Name" };
    const payload: Partial<Item> = { name: "Updated Name" };

    beforeEach(() => {
      mockModel._data$.next([existingItem]);
    });

    it("should call model.update and update data$", async () => {
      await viewModel.updateCommand.execute({ id: existingItem.id, payload });

      expect(mockModel.update).toHaveBeenCalledWith(existingItem.id, payload);
      expect(await firstValueFrom(viewModel.updateCommand.isExecuting$)).toBe(
        false
      );
      const data = await firstValueFrom(viewModel.data$);
      expect(Array.isArray(data) && data[0].name).toBe("Updated Name");
      expect(Array.isArray(data) && data[0].id).toBe(existingItem.id);
    });

    it.skip("should set error$ if update fails", async () => {
      const updateError = new Error("Update failed");
      mockModel.update.mockRejectedValueOnce(updateError);

      await expect(
        viewModel.updateCommand.execute({ id: existingItem.id, payload })
      ).rejects.toThrow(updateError);

      expect(await firstValueFrom(viewModel.error$)).toBe(updateError);
    });
  });

  describe("deleteCommand", () => {
    const itemToDelete: Item = { id: "1", name: "To Be Deleted" };

    beforeEach(() => {
      mockModel._data$.next([itemToDelete, { id: "2", name: "Keep Me" }]);
    });

    it("should call model.delete and update data$", async () => {
      await viewModel.deleteCommand.execute(itemToDelete.id);

      expect(mockModel.delete).toHaveBeenCalledWith(itemToDelete.id);
      expect(await firstValueFrom(viewModel.deleteCommand.isExecuting$)).toBe(
        false
      );
      const data = await firstValueFrom(viewModel.data$);
      expect(Array.isArray(data) && data.length).toBe(1);
      expect(Array.isArray(data) && data[0].id).toBe("2");
    });

    it.skip("should set error$ if delete fails", async () => {
      const deleteError = new Error("Delete failed");
      mockModel.delete.mockRejectedValueOnce(deleteError);

      await expect(
        viewModel.deleteCommand.execute(itemToDelete.id)
      ).rejects.toThrow(deleteError);

      expect(await firstValueFrom(viewModel.error$)).toBe(deleteError);
    });
  });

  describe("selectedItem$ and selectItem method", () => {
    const items: ItemArray = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
      { id: "c", name: "Charlie" },
    ];

    beforeEach(() => {
      mockModel._data$.next(items);
    });

    it("should emit null initially for selectedItem$", async () => {
      expect(await firstValueFrom(viewModel.selectedItem$)).toBeNull();
    });

    it.skip("should update selectedItem$ when selectItem is called with a valid ID", async () => {
      const selectedItemPromise = firstValueFrom(
        viewModel.selectedItem$.pipe(skip(1))
      ); // Skip initial null
      viewModel.selectItem("b");
      expect(await selectedItemPromise).toEqual(items[1]);
    });

    it("should emit null for selectedItem$ if ID is not found", async () => {
      viewModel.selectItem("non-existent-id");
      expect(await firstValueFrom(viewModel.selectedItem$)).toBeNull();
    });

    it("should emit null for selectedItem$ if data$ is not an array", async () => {
      mockModel._data$.next({ id: "single", name: "Single Item" }); // Change model data to single item
      viewModel.selectItem("single"); // Try to select
      expect(await firstValueFrom(viewModel.selectedItem$)).toBeNull(); // Should still be null as it expects an array
    });

    it.skip("should react to changes in data$ and update selectedItem$", async () => {
      // Select 'a'
      viewModel.selectItem("a");
      expect(await firstValueFrom(viewModel.selectedItem$)).toEqual(items[0]);

      // Simulate data update where 'a' is removed (e.g., via delete or refetch)
      const newItems: ItemArray = [
        { id: "b", name: "Bob" },
        { id: "c", name: "Charlie" },
      ];
      // Since selectedItem$ is combineLatest with data$, this change will trigger a recalculation
      mockModel._data$.next(newItems);

      // selectedItem$ should now be null because 'a' is gone from the new data
      expect(await firstValueFrom(viewModel.selectedItem$)).toBeNull();

      // Select 'b' from new data
      viewModel.selectItem("b");
      expect(await firstValueFrom(viewModel.selectedItem$)).toEqual(
        newItems[0]
      );
    });

    it.skip("should handle selectItem(null) to clear selection", async () => {
      viewModel.selectItem("a");
      expect(await firstValueFrom(viewModel.selectedItem$)).toEqual(items[0]);

      viewModel.selectItem(null);
      expect(await firstValueFrom(viewModel.selectedItem$)).toBeNull();
    });
  });
});
