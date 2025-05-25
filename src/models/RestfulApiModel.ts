import { z, ZodSchema } from "zod"; // Ensure 'z' is imported
import { BaseModel } from "./BaseModel";

/**
 * Defines a generic fetcher function type.
 * @template TResponse The expected type of the response data.
 */
export type Fetcher = <TResponse = any>(
  url: string,
  options?: RequestInit
) => Promise<TResponse>;

/**
 * @class RestfulApiModel
 * Extends BaseModel to provide capabilities for interacting with RESTful APIs.
 * It manages data, loading states, and errors specific to API operations.
 * Assumes TData can be either a single resource or an array of resources.
 * @template TData The type of data managed by the model (e.g., User, User[]).
 * @template TSchema The Zod schema type for validating the data.
 */
export class RestfulApiModel<
  TData,
  TSchema extends ZodSchema<TData>
> extends BaseModel<TData, TSchema> {
  private readonly baseUrl: string;
  private readonly endpoint: string;
  private readonly fetcher: Fetcher;

  /**
   * @param baseUrl The base URL for the API (e.g., 'https://api.example.com').
   * @param endpoint The specific endpoint for this model (e.g., 'users').
   * @param fetcher A function to perform HTTP requests (e.g., window.fetch, Axios).
   * @param schema The Zod schema to validate the data.
   * @param initialData Optional initial data for the model.
   */
  constructor(
    baseUrl: string | null,
    endpoint: string | null,
    fetcher: Fetcher | null,
    schema: TSchema,
    initialData: TData | null = null
  ) {
    super(initialData, schema);
    if (!baseUrl || !endpoint || !fetcher) {
      throw new Error(
        "RestfulApiModel requires baseUrl, endpoint, and fetcher."
      );
    }
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.endpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    this.fetcher = fetcher;
  }

  private getUrl(id?: string): string {
    if (id) {
      return `${this.baseUrl}/${this.endpoint}/${id}`;
    }
    return `${this.baseUrl}/${this.endpoint}`;
  }

  /**
   * Executes an API request, handles loading states, errors, and validates response.
   * @param url The URL for the request.
   * @param options Fetch API options.
   * @param expectedType The expected type of the response ('single' or 'collection').
   * @returns The validated response data.
   */
  private async executeApiRequest(
    url: string,
    options: RequestInit = {},
    expectedType: "single" | "collection" | "none" = "single"
  ): Promise<any> {
    this.setLoading(true);
    this.clearError();
    try {
      const response = await this.fetcher(url, options);
      if (!response) {
        // For fetcher that might return null/undefined on non-2xx status before throwing
        throw new Error(`API request to ${url} failed with empty response.`);
      }

      // Attempt to parse JSON only if content-type suggests it
      const contentType = response.headers?.get("content-type");
      let data: any = null;
      if (contentType && contentType.includes("application/json")) {
        data = await (response as Response).json();
      } else if (response instanceof Response && response.status === 204) {
        // No content for 204
        data = null;
      } else if (response instanceof Response) {
        // For other non-JSON responses, e.g. text
        data = await response.text();
      } else {
        // If fetcher doesn't return a Response object but processed data directly (e.g. Axios already parses)
        data = response;
      }

      if (this.schema && expectedType !== "none") {
        if (expectedType === "collection") {
          return z.array(this.schema).parse(data); // Use imported 'z'
        } else { // 'single'
          return this.schema.parse(data);
        }
      }
      return data;
    } catch (err) {
      this.setError(err);
      throw err; // Re-throw to allow caller to handle
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Fetches data from the API.
   * If `id` is provided, fetches a single resource. Otherwise, fetches a collection.
   * The model's `data$` will be updated with the fetched data.
   * @param id Optional ID of the resource to fetch.
   * @returns A promise that resolves when the fetch operation is complete.
   */
  public async fetch(id?: string | string[]): Promise<void> {
    let url = this.getUrl();
    let expectedType: "single" | "collection" = "collection";

    if (id) {
      if (Array.isArray(id)) {
        url = `${this.getUrl()}?ids=${id.join(",")}`; // Example for fetching multiple by ID
        expectedType = "collection";
      } else {
        url = this.getUrl(id);
        expectedType = "single";
      }
    }

    try {
      const fetchedData = await this.executeApiRequest(
        url,
        { method: "GET" },
        expectedType
      );
      this.setData(fetchedData);
    } catch (error) {
      // Error already set by executeApiRequest
    }
  }

  /**
   * Creates a new resource by sending a POST request to the API.
   * If the model's `data$` is an array, the new item will be appended.
   * If it's a single item, it will be replaced.
   * @param payload The data for the new resource.
   * @returns A promise that resolves when the creation is complete.
   */
  public async create(payload: Partial<TData>): Promise<void> {
    try {
      const createdItem = await this.executeApiRequest(
        this.getUrl(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        "single" // Assuming create returns the created item
      );

      const currentData = this._data$.getValue();
      if (Array.isArray(currentData)) {
        this.setData([...currentData, createdItem] as TData);
      } else {
        this.setData(createdItem);
      }
    } catch (error) {
      // Error already set by executeApiRequest
    }
  }

  /**
   * Updates an existing resource by sending a PUT/PATCH request to the API.
   * If the model's `data$` is an array, the corresponding item will be updated.
   * If it's a single item, it will be replaced.
   * @param id The ID of the resource to update.
   * @param payload The data to update the resource with.
   * @returns A promise that resolves when the update is complete.
   */
  public async update(id: string, payload: Partial<TData>): Promise<void> {
    try {
      const updatedItem = await this.executeApiRequest(
        this.getUrl(id),
        {
          method: "PUT", // Or 'PATCH' depending on API design
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        "single" // Assuming update returns the updated item
      );

      const currentData = this._data$.getValue();
      if (Array.isArray(currentData)) {
        this.setData(
          currentData.map((item) =>
            (item as any).id === id ? updatedItem : item
          ) as TData
        );
      } else {
        this.setData(updatedItem);
      }
    } catch (error) {
      // Error already set by executeApiRequest
    }
  }

  /**
   * Deletes a resource by sending a DELETE request to the API.
   * If the model's `data$` is an array, the corresponding item will be removed.
   * If it's a single item, it will be set to `null`.
   * @param id The ID of the resource to delete.
   * @returns A promise that resolves when the deletion is complete.
   */
  public async delete(id: string): Promise<void> {
    try {
      // Assuming DELETE usually returns no content or a success status
      await this.executeApiRequest(
        this.getUrl(id),
        { method: "DELETE" },
        "none"
      );

      const currentData = this._data$.getValue();
      if (Array.isArray(currentData)) {
        this.setData(
          currentData.filter((item) => (item as any).id !== id) as TData
        );
      } else if ((currentData as any)?.id === id) {
        this.setData(null);
      }
    } catch (error) {
      // Error already set by executeApiRequest
    }
  }

  public dispose(): void {
    // TODO: why does the test call this ?
    // Additional cleanup if needed for RestfulApiModel
    // For example, cancel any ongoing requests or clear specific state
  }
}
