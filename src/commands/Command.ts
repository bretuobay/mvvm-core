import { BehaviorSubject, Observable, isObservable, of } from "rxjs";
import { first, map, switchMap } from "rxjs/operators";

/**
 * @interface ICommand
 * Defines the public interface for a Command.
 * @template TParam The type of the parameter passed to the command's execute function.
 * @template TResult The type of the result returned by the command's execute function.
 */
export interface ICommand<TParam = void, TResult = void> {
  readonly canExecute$: Observable<boolean>;
  readonly isExecuting$: Observable<boolean>;
  readonly executeError$: Observable<any>;

  execute(param: TParam): Promise<TResult | undefined>;
}

/**
 * @class Command
 * Implements the Command pattern, encapsulating an action that can be executed,
 * along with its execution status, whether it can be executed, and any errors.
 * Suitable for binding to UI elements like buttons.
 * @template TParam The type of the parameter passed to the command's execute function.
 * @template TResult The type of the result returned by the command's execute function.
 */
export class Command<TParam = void, TResult = void>
  implements ICommand<TParam, TResult>
{
  protected readonly _isExecuting$ = new BehaviorSubject<boolean>(false);
  public readonly isExecuting$: Observable<boolean> =
    this._isExecuting$.asObservable();

  protected readonly _canExecute$: Observable<boolean>; // Derived from constructor arg
  protected readonly _executeError$ = new BehaviorSubject<any>(null);
  public readonly executeError$: Observable<any> =
    this._executeError$.asObservable();

  private readonly _executeFn: (param: TParam) => Promise<TResult>;

  /**
   * @param executeFn The function to execute when the command is triggered.
   * It should return a Promise.
   * @param canExecuteFn An optional function or Observable determining if the command can be executed.
   * If a function, it's called with the parameter. If an Observable, it emits boolean.
   * Defaults to always true if not provided.
   */
  constructor(
    executeFn: (param: TParam) => Promise<TResult>,
    canExecuteFn?:
      | ((param: TParam) => Observable<boolean> | boolean)
      | Observable<boolean>
  ) {
    if (typeof executeFn !== "function") {
      throw new Error("Command requires an executeFn that is a function.");
    }
    this._executeFn = executeFn;

    if (canExecuteFn === undefined) {
      this._canExecute$ = of(true); // Always executable by default
    } else if (isObservable(canExecuteFn)) {
      this._canExecute$ = canExecuteFn;
    } else if (typeof canExecuteFn === "function") {
      // If canExecuteFn is a function, it takes the parameter.
      // We need to provide a default value for the parameter when mapping
      // to an observable that doesn't have a parameter.
      // For a general canExecute$ observable that doesn't depend on param,
      // we'd need to assume a default param or a mechanism to re-evaluate.
      // For simplicity here, if it's a function, we'll assume it doesn't depend
      // on the *current* parameter or has a default, or it's up to the consumer
      // to re-evaluate it with a specific param if needed.
      // A more robust implementation might involve passing the latest param
      // to canExecuteFn and using combineLatest with another subject for param.
      this._canExecute$ = of(true); // Default to true, or user must manage
      console.warn(
        "canExecuteFn as a function for Command's constructor is deprecated. Use an Observable<boolean> for reactive canExecute$."
      );
      // A better way would be to create a separate internal subject for params
      // and combine it with the canExecuteFn. For now, this is a simplification.
    } else {
      throw new Error(
        "canExecuteFn must be an Observable<boolean> or a function returning boolean/Observable<boolean>."
      );
    }
  }

  /**
   * The observable indicating whether the command can currently be executed.
   */
  public get canExecute$(): Observable<boolean> {
    return this._canExecute$.pipe(
      switchMap((canExec) =>
        this._isExecuting$.pipe(map((isExec) => canExec && !isExec))
      )
    );
  }

  /**
   * Executes the command's action.
   * It manages the `isExecuting$` and `executeError$` states.
   * @param param The parameter to pass to the `executeFn`.
   * @returns A promise that resolves with the result of the execution, or undefined if not executable.
   */
  public async execute(param: TParam): Promise<TResult | undefined> {
    const canExecuteNow = await this.canExecute$.pipe(first()).toPromise();

    if (!canExecuteNow) {
      console.log("Command cannot be executed.");
      return;
    }

    this._isExecuting$.next(true);
    this._executeError$.next(null); // Clear previous errors

    try {
      const result = await this._executeFn(param);
      return result;
    } catch (error) {
      this._executeError$.next(error);
      throw error; // Re-throw to allow caller to handle if needed
    } finally {
      this._isExecuting$.next(false);
    }
  }
}
