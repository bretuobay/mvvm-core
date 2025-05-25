import { vi, describe, beforeEach, afterEach, it, expect } from "vitest";
import { Command } from "./Command";
import { BehaviorSubject } from "rxjs";
import { first } from "rxjs/operators";

describe("Command", () => {
  // @ts-ignore
  let mockExecuteFn: vi.Mock;
  let command: Command<string, string>;

  beforeEach(() => {
    mockExecuteFn = vi.fn(async (param: string) => `Executed: ${param}`);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with canExecute$ true, isExecuting$ false, and no error", async () => {
    command = new Command(mockExecuteFn);
    expect(await command.canExecute$.pipe(first()).toPromise()).toBe(true);
    expect(await command.isExecuting$.pipe(first()).toPromise()).toBe(false);
    expect(await command.executeError$.pipe(first()).toPromise()).toBeNull();
  });

  it("should throw error if executeFn is not a function", () => {
    // @ts-ignore
    expect(() => new Command(null)).toThrow(
      "Command requires an executeFn that is a function."
    );
  });

  it("should execute the function and update states correctly", async () => {
    command = new Command(mockExecuteFn);
    const param = "test_param";

    const isExecutingStates: boolean[] = [];
    command.isExecuting$.subscribe((val) => isExecutingStates.push(val));

    const canExecuteStates: boolean[] = [];
    command.canExecute$.subscribe((val) => canExecuteStates.push(val));

    const executionPromise = command.execute(param);

    /**
     * 1. Subscriptions are synchronous, but state changes are async
        When you subscribe to isExecuting$ and canExecute$, you immediately get the current value (false and true respectively).
        When you call command.execute(param), the state changes (isExecuting$ becomes true, canExecute$ becomes false) happen asynchronously (after awaiting canExecute$ and before/after the async function runs).
        The state change to true for isExecuting$ and to false for canExecute$ may not be captured in the arrays before the expect assertions run, because the execution hasn't yielded to the event loop yet.

        2. The expectations are run immediately after calling command.execute(param) (which returns a Promise), but before the async state changes have a chance to emit and be pushed into your arrays.
     */

    // Wait for the next tick so BehaviorSubjects emit their new values
    await Promise.resolve();
    // or
    // const result = await executionPromise;

    // Expect states during execution
    expect(isExecutingStates).toEqual([false, true]); // Initial false, then true
    // CanExecute should be false while executing
    expect(canExecuteStates).toEqual([true, false]); // Initial true, then false

    const result = await executionPromise;

    // Expect states after execution
    expect(result).toBe("Executed: test_param");
    expect(mockExecuteFn).toHaveBeenCalledWith(param);
    expect(await command.isExecuting$.pipe(first()).toPromise()).toBe(false); // Back to false
    expect(await command.canExecute$.pipe(first()).toPromise()).toBe(true); // Back to true
    expect(await command.executeError$.pipe(first()).toPromise()).toBeNull(); // No error
  });

  it("should set executeError$ if execution fails", async () => {
    const error = new Error("Execution failed");
    mockExecuteFn.mockRejectedValue(error);
    command = new Command(mockExecuteFn);

    await expect(command.execute("param")).rejects.toThrow(error);

    expect(await command.isExecuting$.pipe(first()).toPromise()).toBe(false);
    expect(await command.canExecute$.pipe(first()).toPromise()).toBe(true);
    expect(await command.executeError$.pipe(first()).toPromise()).toBe(error);
  });

  describe("canExecute$ with Observable condition", () => {
    let canExecuteSubject: BehaviorSubject<boolean>;

    beforeEach(() => {
      canExecuteSubject = new BehaviorSubject(true);
      command = new Command(mockExecuteFn, canExecuteSubject.asObservable());
    });

    it("should respect the canExecute$ observable", async () => {
      expect(await command.canExecute$.pipe(first()).toPromise()).toBe(true);

      canExecuteSubject.next(false);
      expect(await command.canExecute$.pipe(first()).toPromise()).toBe(false);

      canExecuteSubject.next(true);
      expect(await command.canExecute$.pipe(first()).toPromise()).toBe(true);
    });

    it("should not execute if canExecute$ is false", async () => {
      canExecuteSubject.next(false);
      const result = await command.execute("param");

      expect(mockExecuteFn).not.toHaveBeenCalled();
      expect(result).toBeUndefined(); // Command returns undefined if not executable
      expect(await command.isExecuting$.pipe(first()).toPromise()).toBe(false);
      expect(await command.executeError$.pipe(first()).toPromise()).toBeNull();
    });

    it("should return false for canExecute$ while executing", async () => {
      canExecuteSubject.next(true); // Can execute
      const canExecuteStates: boolean[] = [];
      command.canExecute$.subscribe((val) => canExecuteStates.push(val));

      const promise = command.execute("param");

      await Promise.resolve(); // Wait for state updates
      expect(canExecuteStates).toEqual([true, false]); // True initially, then false during execution
      await promise;
      expect(canExecuteStates).toEqual([true, false, true]); // Back to true after execution
    });

    it("should still be false for canExecute$ if canExecuteSubject is false even if not executing", async () => {
      canExecuteSubject.next(false);
      expect(await command.canExecute$.pipe(first()).toPromise()).toBe(false);
    });
  });

  // Test for canExecuteFn as a simple boolean function (deprecated warning test)
  it("should warn and default canExecute$ to true if canExecuteFn is a function (deprecated usage)", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    command = new Command(mockExecuteFn, (param: string) => param === "valid"); // Deprecated usage
    expect(await command.canExecute$.pipe(first()).toPromise()).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "canExecuteFn as a function for Command's constructor is deprecated."
      )
    );
    consoleWarnSpy.mockRestore();
  });

  it("should reject with a specific error if canExecuteFn is not an Observable or function", () => {
    // @ts-ignore
    expect(() => new Command(mockExecuteFn, 123)).toThrow(
      "canExecuteFn must be an Observable<boolean> or a function returning boolean/Observable<boolean>."
    );
  });
});
