import { describe, it, beforeEach, expect } from "vitest";
import { BaseModel } from "./BaseModel";
import { z } from "zod";
import { first } from "rxjs/operators";

describe("BaseModel", () => {
  // Define a simple Zod schema for testing
  const TestSchema = z.object({
    id: z.string(),
    name: z.string(),
    age: z.number().min(0),
  });

  type TestDataType = z.infer<typeof TestSchema>;

  let model: BaseModel<TestDataType, typeof TestSchema>;

  beforeEach(() => {
    model = new BaseModel<TestDataType, typeof TestSchema>(null, TestSchema);
  });

  it("should initialize with null data, not loading, and no error", async () => {
    expect(await model.data$.pipe(first()).toPromise()).toBeNull();
    expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
    expect(await model.error$.pipe(first()).toPromise()).toBeNull();
  });

  it("should set initial data correctly", async () => {
    const initialData = { id: "1", name: "Initial", age: 30 };
    const newModel = new BaseModel<TestDataType, typeof TestSchema>(
      initialData,
      TestSchema
    );
    expect(await newModel.data$.pipe(first()).toPromise()).toEqual(initialData);
  });

  it("should update data using setData", async () => {
    const newData = { id: "2", name: "Updated", age: 25 };
    model.setData(newData);
    expect(await model.data$.pipe(first()).toPromise()).toEqual(newData);
  });

  it("should update loading status using setLoading", async () => {
    model.setLoading(true);
    expect(await model.isLoading$.pipe(first()).toPromise()).toBe(true);

    model.setLoading(false);
    expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
  });

  it("should set and clear errors", async () => {
    const testError = new Error("Something went wrong");
    model.setError(testError);
    expect(await model.error$.pipe(first()).toPromise()).toEqual(testError);

    model.clearError();
    expect(await model.error$.pipe(first()).toPromise()).toBeNull();
  });

  it("should validate data successfully using the provided schema", () => {
    const validData = { id: "abc", name: "Test User", age: 42 };
    expect(model.validate(validData)).toEqual(validData);
  });

  it("should throw ZodError for invalid data when schema is provided", () => {
    const invalidData = { id: "def", name: "Another User", age: -5 }; // Invalid age
    expect(() => model.validate(invalidData)).toThrow(z.ZodError);
  });

  it("should not throw if no schema is provided", () => {
    const noSchemaModel = new BaseModel<any, any>(null, undefined);
    const data = { foo: "bar" };
    expect(() => noSchemaModel.validate(data)).not.toThrow();
    expect(noSchemaModel.validate(data)).toEqual(data); // Returns data as is
  });

  it("should emit changes to data$ when setData is called multiple times", async () => {
    const emittedData: (TestDataType | null)[] = [];
    model.data$.subscribe((data) => emittedData.push(data));

    model.setData({ id: "a", name: "A", age: 1 });
    model.setData({ id: "b", name: "B", age: 2 });
    model.setData(null);

    // Expect initial null, then 'a', then 'b', then null again
    expect(emittedData).toEqual([
      null, // Initial state
      { id: "a", name: "A", age: 1 },
      { id: "b", name: "B", age: 2 },
      null,
    ]);
  });
});
