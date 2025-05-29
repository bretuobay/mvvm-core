// src/viewmodels/RestfulApiViewModel.ts
import { BehaviorSubject, combineLatest, Observable } from "rxjs";
import { map, startWith } from "rxjs/operators";
import { RestfulApiModel } from "../models/RestfulApiModel";
import { Command } from "../commands/Command"; // Assuming Command is in '../commands'
import { ZodSchema } from "zod";

/**
 * @class RestfulApiViewModel
 * A generic ViewModel to facilitate CRUD operations and state management for a specific
 * RestfulApiModel. It exposes data, loading states, and operations as observables and commands,
 * making it easy to consume in frontend frameworks.
 * @template TData The type of data managed by the underlying RestfulApiModel (e.g., User, User[]).
 * @template TSchema The Zod schema type for validating the data.
 */
export class RestfulApiViewModel<TData, TSchema extends ZodSchema<TData>> {
  protected model: RestfulApiModel<TData, TSchema>;

  /**
   * Exposes the current data from the RestfulApiModel.
   * Use this in your UI to bind to the list or single item.
   */
  public readonly data$: Observable<TData | null>;

  /**
   * Exposes the loading state of the RestfulApiModel.
   * Use this to show spinners or disable UI elements.
   */
  public readonly isLoading$: Observable<boolean>;

  /**
   * Exposes any error encountered by the RestfulApiModel.
   * Use this to display error messages to the user.
   */
  public readonly error$: Observable<any>;

  // Commands for CRUD operations
  public readonly fetchCommand: Command<string | string[] | void, void>;
  public readonly createCommand: Command<Partial<TData>, void>;
  public readonly updateCommand: Command<
    { id: string; payload: Partial<TData> },
    void
  >;
  public readonly deleteCommand: Command<string, void>;

  // Optional: Example of view-specific state for a collection
  // If TData is an array, you might want to manage selections, filters, etc.
  // This example assumes TData can be an array where items have an 'id'
  public readonly selectedItem$: Observable<TData | null>;
  protected _selectedItemId$ = new BehaviorSubject<string | null>(null);

  /**
   * @param model An instance of RestfulApiModel that this ViewModel will manage.
   */
  constructor(model: RestfulApiModel<TData, TSchema>) {
    if (!(model instanceof RestfulApiModel)) {
      throw new Error(
        "RestfulApiViewModel requires an instance of RestfulApiModel."
      );
    }
    this.model = model;

    this.data$ = this.model.data$;
    this.isLoading$ = this.model.isLoading$;
    this.error$ = this.model.error$;

    // Initialize Commands
    this.fetchCommand = new Command(async (id?: string | string[] | void) => {
      await this.model.fetch(id === undefined ? undefined : id);
    });

    this.createCommand = new Command(async (payload: Partial<TData>) => {
      await this.model.create(payload);
    });

    this.updateCommand = new Command(async ({ id, payload }) => {
      await this.model.update(id, payload);
    });

    this.deleteCommand = new Command(async (id: string) => {
      await this.model.delete(id);
    });

    // Example for selected item (assumes TData is an array of objects with 'id')
    this.selectedItem$ = combineLatest([
      this.data$,
      this._selectedItemId$,
    ]).pipe(
      map(([data, selectedId]) => {
        if (Array.isArray(data) && selectedId) {
          return data.find((item: any) => item.id === selectedId) || null;
        }
        return null;
      }),
      startWith(null) // Ensure initial value
    );
  }

  /**
   * Selects an item by its ID. Useful for showing details or for editing.
   * @param id The ID of the item to select.
   */
  public selectItem(id: string | null): void {
    this._selectedItemId$.next(id);
  }
}
