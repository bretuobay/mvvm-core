import { describe, it, beforeEach, expect, afterEach, vi } from 'vitest';

import { RestfulApiModel, Fetcher } from './RestfulApiModel';
import { BaseModel } from './BaseModel'; // Import BaseModel
import { z, ZodError, ZodIssueCode } from 'zod'; // Consolidated Zod import
import { first } from 'rxjs/operators'; // Removed skip

// Define a simple Zod schema for testing
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  optionalField: z.string().optional(),
});

type User = z.infer<typeof UserSchema>;

// Helper to create an invalid user object (e.g., missing email)
const createInvalidUser = (id: string, name: string): Partial<User> => ({
  id,
  name,
  // email is missing
});

// Helper to create a user object with an invalid email format
const createUserWithInvalidEmail = (id: string, name: string): User => ({
  id,
  name,
  email: 'not-a-valid-email',
});

describe('RestfulApiModel', () => {
  const baseUrl = 'https://api.test.com';
  // @ts-ignore
  let mockFetcher: vi.Mock<ReturnType<Fetcher>>;
  const endpoint = 'users';
  let model: RestfulApiModel<User | User[], typeof UserSchema>;

  beforeEach(() => {
    mockFetcher = vi.fn();
    model = new RestfulApiModel<User | User[], typeof UserSchema>({
      baseUrl,
      endpoint,
      fetcher: mockFetcher,
      schema: UserSchema,
      initialData: null, // Start with no initial data
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize correctly with base properties', async () => {
    expect(await model.data$.pipe(first()).toPromise()).toBeNull();
    expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
    expect(await model.error$.pipe(first()).toPromise()).toBeNull();
  });

  it('should throw error if baseUrl, endpoint, or fetcher are missing', () => {
    // @ts-ignore
    expect(
      // () => new RestfulApiModel(null, endpoint, mockFetcher, UserSchema)
      () =>
        new RestfulApiModel({
          baseUrl: null,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema as any,
          initialData: null,
        }),
    ).toThrow('RestfulApiModel requires baseUrl, endpoint, and fetcher.');
    // @ts-ignore
    expect(
      // () => new RestfulApiModel(baseUrl, null, mockFetcher, UserSchema)
      () =>
        new RestfulApiModel({
          baseUrl,
          endpoint: null,
          fetcher: mockFetcher,
          schema: UserSchema as any,
          initialData: null,
        }),
    ).toThrow('RestfulApiModel requires baseUrl, endpoint, and fetcher.');
    // @ts-ignore
    expect(
      // () => new RestfulApiModel(baseUrl, endpoint, null, UserSchema)
      () =>
        new RestfulApiModel({
          baseUrl,
          endpoint,
          fetcher: null,
          schema: UserSchema as any,
          initialData: null,
        }),
    ).toThrow('RestfulApiModel requires baseUrl, endpoint, and fetcher.');
  });

  describe('fetch method', () => {
    // The problematic test "should fetch a collection of users and update data$" has been removed.

    it('should fetch a collection, update data$, and manage loading states', async () => {
      const users: User[] = [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ];
      mockFetcher.mockResolvedValue({
        ok: true, // Important for RestfulApiModel's internal checks
        json: () => Promise.resolve(users),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const isLoadingHistory: boolean[] = [];
      const subscription = model.isLoading$.subscribe((value) => {
        isLoadingHistory.push(value);
      });

      await model.fetch(); // Perform the fetch operation

      // Assertions
      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}`, {
        method: 'GET',
      });

      // data$ is a BehaviorSubject. After fetch, its current value should be the fetched users.
      // pipe(first()) gets the current value of the BehaviorSubject after fetch has completed.
      expect(await model.data$.pipe(first()).toPromise()).toEqual(users);

      // isLoading$ sequence:
      // 1. Initial `false` (from BehaviorSubject construction, captured on subscription)
      // 2. `true` (when fetch starts)
      // 3. `false` (when fetch ends in finally block)
      expect(isLoadingHistory).toEqual([false, true, false]);

      expect(await model.error$.pipe(first()).toPromise()).toBeNull();

      subscription.unsubscribe(); // Clean up subscription
    }, 10000); // Timeout

    it('should fetch a single user by ID and update data$', async () => {
      const user: User = { id: '1', name: 'Alice', email: 'alice@example.com' };
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(user),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      await model.fetch('1');

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}/1`, {
        method: 'GET',
      });
      expect(await model.data$.pipe(first()).toPromise()).toEqual(user);
    });

    it('should set error$ if fetch fails', async () => {
      const fetchError = new Error('Network error');
      mockFetcher.mockRejectedValue(fetchError);

      await expect(model.fetch()).rejects.toThrow('Network error');

      expect(await model.error$.pipe(first()).toPromise()).toBe(fetchError);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false); // Loading should be false after error
    });

    it('should throw ZodError if fetched data is invalid', async () => {
      const invalidData = [{ id: '1', name: 'Alice', email: 'invalid-email' }]; // invalid email
      mockFetcher.mockResolvedValue({
        json: () => Promise.resolve(invalidData),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      await expect(model.fetch()).rejects.toThrowError(ZodError);

      const error = await model.error$.pipe(first()).toPromise();
      expect(error).toBeInstanceOf(ZodError); // Assuming ZodError is correctly imported

      const zodError = error as ZodError;
      expect(zodError.issues.length).toBeGreaterThan(0);
      const firstIssue = zodError.issues[0];

      // Check the code first
      expect(firstIssue.code).toBe(ZodIssueCode.invalid_string); // Assuming ZodIssueCode is correctly imported

      // Now, TypeScript should allow access to 'validation' by narrowing the type
      if (firstIssue.code === ZodIssueCode.invalid_string) {
        expect(firstIssue.validation).toBe('email');
      } else {
        // Fail the test explicitly if it's not the expected issue code,
        // as the .validation check wouldn't make sense otherwise.
        throw new Error('Test expectation failed: Expected ZodIssueCode.invalid_string, but got ' + firstIssue.code);
      }
      expect(await model.data$.pipe(first()).toPromise()).toBeNull(); // Data should not be set
    });

    it('should throw ZodError if fetched data is invalid and validateSchema is true (explicit)', async () => {
      const modelValidateTrue = new RestfulApiModel<User, typeof UserSchema>({
        baseUrl,
        endpoint: 'singleUser', // Using a different endpoint for clarity if needed
        fetcher: mockFetcher,
        schema: UserSchema,
        initialData: null,
        validateSchema: true,
      });

      const invalidUserData = createUserWithInvalidEmail('1', 'Invalid User');
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidUserData),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      await expect(modelValidateTrue.fetch('1')).rejects.toThrowError(ZodError);
      expect(await modelValidateTrue.error$.pipe(first()).toPromise()).toBeInstanceOf(ZodError);
      expect(await modelValidateTrue.data$.pipe(first()).toPromise()).toBeNull();
      modelValidateTrue.dispose();
    });

    it('should fetch and set invalid data if validateSchema is false', async () => {
      const modelValidateFalse = new RestfulApiModel<User, typeof UserSchema>({
        baseUrl,
        endpoint: 'singleUser',
        fetcher: mockFetcher,
        schema: UserSchema,
        initialData: null,
        validateSchema: false,
      });

      const technicallyInvalidUserData = createInvalidUser('1', 'Invalid User Allowed') as User; // Cast because it's partial
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(technicallyInvalidUserData),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      await expect(modelValidateFalse.fetch('1')).resolves.not.toThrow();
      expect(await modelValidateFalse.error$.pipe(first()).toPromise()).toBeNull();
      expect(await modelValidateFalse.data$.pipe(first()).toPromise()).toEqual(technicallyInvalidUserData);
      modelValidateFalse.dispose();
    });
  });

  describe('create method', () => {
    const serverUser: User = {
      // Renamed from newUser to distinguish from payload
      id: 'server-3', // Server assigns a real ID
      name: 'Charlie Server',
      email: 'charlie@example.com',
    };
    const payload: Partial<User> = {
      // Payload might not have ID
      name: 'Charlie Server',
      email: 'charlie@example.com',
    };
    const payloadWithClientId: Partial<User> & { id: string } = {
      id: 'client-temp-123',
      name: 'Charlie Client ID',
      email: 'charlie.client@example.com',
    };
    const serverUserFromClientPayload: User = {
      id: 'server-assigned-from-client-payload',
      name: payloadWithClientId.name!,
      email: payloadWithClientId.email!,
    };

    let initialCollectionData: User[];

    beforeEach(() => {
      initialCollectionData = [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ];
      model.setData([...initialCollectionData]); // Use a copy
      // Default mock fetcher for successful creation
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverUser),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);
    });

    it('should optimistically add item with temp ID, then update with server response', async () => {
      const dataEmissions: (User | User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null)); // Deep copy for arrays/objects

      // Use a payload without an ID, so a temp ID is generated
      const createPayload: Partial<User> = {
        name: 'Charlie Temp',
        email: 'temp@example.com',
      };
      const serverResponseUser: User = {
        id: 'server-gen-id-1',
        name: createPayload.name!,
        email: createPayload.email!,
      };
      mockFetcher.mockResolvedValue({
        // Specific mock for this test
        ok: true,
        json: () => Promise.resolve(serverResponseUser),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const promise = model.create(createPayload);

      // 1. Initial data (already captured by subscribe if not skipped)
      // 2. Optimistic update
      expect(dataEmissions.length).toBeGreaterThanOrEqual(2); // Initial + Optimistic
      const optimisticData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(optimisticData.length).toBe(initialCollectionData.length + 1);
      const tempItem = optimisticData.find((u) => u.name === createPayload.name);
      expect(tempItem).toBeDefined();
      expect(tempItem!.id.startsWith('temp_')).toBe(true);

      await promise;

      // 3. Final update from server
      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial + Optimistic + Server
      const finalData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(finalData.length).toBe(initialCollectionData.length + 1);
      expect(finalData.find((u) => u.id === serverResponseUser.id)).toEqual(serverResponseUser);
      expect(finalData.find((u) => u.id === tempItem!.id)).toBeUndefined(); // Temp item should be replaced

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
      expect(await model.error$.pipe(first()).toPromise()).toBeNull();
    });

    it('should optimistically add item with client-provided ID, then update with server response', async () => {
      const dataEmissions: (User | User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      mockFetcher.mockResolvedValue({
        // Specific mock for this test
        ok: true,
        json: () => Promise.resolve(serverUserFromClientPayload),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const promise = model.create(payloadWithClientId);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(2);
      const optimisticData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(optimisticData.length).toBe(initialCollectionData.length + 1);
      const tempItem = optimisticData.find((u) => u.id === payloadWithClientId.id);
      expect(tempItem).toEqual(payloadWithClientId);

      await promise;

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3);
      const finalData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(finalData.length).toBe(initialCollectionData.length + 1);
      expect(finalData.find((u) => u.id === serverUserFromClientPayload.id)).toEqual(serverUserFromClientPayload);
      // If server can change the ID, the client-provided ID might be gone
      if (payloadWithClientId.id !== serverUserFromClientPayload.id) {
        expect(finalData.find((u) => u.id === payloadWithClientId.id)).toBeUndefined();
      }
    });

    it('should revert optimistic add from collection if create fails', async () => {
      const dataEmissions: (User | User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      const createError = new Error('Creation failed');
      mockFetcher.mockRejectedValue(createError);

      // Use a payload without an ID
      const createPayloadFail: Partial<User> = {
        name: 'Fail User',
        email: 'fail@example.com',
      };

      await expect(model.create(createPayloadFail)).rejects.toThrow(createError);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Reverted
      const optimisticData = dataEmissions[dataEmissions.length - 2] as User[];
      expect(optimisticData.length).toBe(initialCollectionData.length + 1);
      expect(optimisticData.find((u) => u.name === createPayloadFail.name)).toBeDefined();

      const finalData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(finalData).toEqual(initialCollectionData); // Should be back to original
      expect(await model.error$.pipe(first()).toPromise()).toBe(createError);
    });

    it('should replace data$ with server response if initial data was single item/null', async () => {
      const singleItemModel = new RestfulApiModel<User, typeof UserSchema>(
        // baseUrl,
        // endpoint,
        // mockFetcher,
        // UserSchema,
        // null // Initial data is null
        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: null, // Start with no initial data
        },
      );
      mockFetcher.mockResolvedValue({
        // Ensure fresh mock for this model
        ok: true,
        json: () => Promise.resolve(serverUser),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const dataEmissionsSingle: (User | null)[] = [];
      singleItemModel.data$.subscribe((data) =>
        dataEmissionsSingle.push(data ? JSON.parse(JSON.stringify(data)) : null),
      );

      await singleItemModel.create(payload);

      // Initial (null), Optimistic (payload with temp ID), Server response
      expect(dataEmissionsSingle.length).toBeGreaterThanOrEqual(3);
      const optimisticSingle = dataEmissionsSingle[dataEmissionsSingle.length - 2] as User;
      expect(optimisticSingle.name).toBe(payload.name);
      // If payload had no ID, temp ID was generated
      if (!payload.id) expect(optimisticSingle.id.startsWith('temp_')).toBe(true);

      expect(await singleItemModel.data$.pipe(first()).toPromise()).toEqual(serverUser);
      singleItemModel.dispose();
    });

    it('should revert optimistic set of single item if create fails', async () => {
      const initialSingleUser = {
        id: 'single-initial',
        name: 'Initial Single',
        email: 'single@example.com',
      };
      const singleItemModelFail = new RestfulApiModel<User, typeof UserSchema>(
        // baseUrl,
        // endpoint,
        // mockFetcher,
        // UserSchema,
        // initialSingleUser
        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: JSON.parse(JSON.stringify(initialSingleUser)), // Use a deep copy
        },
      );
      const createError = new Error('Single Create Failed');
      mockFetcher.mockRejectedValue(createError); // Mock failure for this model

      const dataEmissionsSingleFail: (User | null)[] = [];
      singleItemModelFail.data$.subscribe((data) =>
        dataEmissionsSingleFail.push(data ? JSON.parse(JSON.stringify(data)) : null),
      );

      await expect(singleItemModelFail.create(payload)).rejects.toThrow(createError);

      expect(dataEmissionsSingleFail.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Reverted
      const optimisticSingleFailed = dataEmissionsSingleFail[dataEmissionsSingleFail.length - 2] as User;
      expect(optimisticSingleFailed.name).toBe(payload.name); // Check it was optimistically set

      expect(await singleItemModelFail.data$.pipe(first()).toPromise()).toEqual(initialSingleUser); // Reverted
      expect(await singleItemModelFail.error$.pipe(first()).toPromise()).toBe(createError);
      singleItemModelFail.dispose();
    });

    it('should throw ZodError on create if server response is invalid and validateSchema is true', async () => {
      const modelValidateTrue = new RestfulApiModel<User[], typeof UserSchema>({
        baseUrl,
        endpoint,
        fetcher: mockFetcher,
        schema: UserSchema, // Note: schema is for single item, model handles array context if TData is User[]
        initialData: [],
        validateSchema: true,
      });

      const invalidServerResponse = createUserWithInvalidEmail('new-id', 'Created Invalid');
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidServerResponse),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const createPayload: Partial<User> = { name: 'Test', email: 'test@example.com' };
      await expect(modelValidateTrue.create(createPayload)).rejects.toThrowError(ZodError);
      expect(await modelValidateTrue.error$.pipe(first()).toPromise()).toBeInstanceOf(ZodError);
      // Optimistic update should have been reverted
      expect(await modelValidateTrue.data$.pipe(first()).toPromise()).toEqual([]);
      modelValidateTrue.dispose();
    });

    it('should create and set invalid created item if validateSchema is false', async () => {
      const modelValidateFalse = new RestfulApiModel<User[], typeof UserSchema>({
        baseUrl,
        endpoint,
        fetcher: mockFetcher,
        schema: UserSchema,
        initialData: [],
        validateSchema: false,
      });

      const invalidServerResponse = createInvalidUser('new-id-invalid', 'Created Invalid Allowed') as User;
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidServerResponse),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const createPayload: Partial<User> = { name: 'Test Valid Payload', email: 'validpayload@example.com' };

      // Create a temporary valid item for optimistic update based on payload
      // This is a bit simplified; real optimistic would use a temp ID or the payload directly if it had an ID
      const tempOptimisticItem = { ...createPayload, id: 'temp_create_id_false_validate' } as User;

      // Manually simulate optimistic update for this test case for clarity on what we expect before server response
      // In a real scenario, model.create would do this internally.
      // Here, we want to ensure the *server's* invalid data is accepted.
      // So, we let create() do its optimistic part, then check the final state.

      await expect(modelValidateFalse.create(createPayload)).resolves.toEqual(invalidServerResponse);
      expect(await modelValidateFalse.error$.pipe(first()).toPromise()).toBeNull();

      const currentData = await modelValidateFalse.data$.pipe(first()).toPromise();
      // The optimistic update would have added an item. The server response (invalid) replaces it.
      // The exact nature of optimistic update (temp ID vs. server ID) makes direct length check tricky without more detail.
      // Key is that the invalidServerResponse is in the data.
      expect(currentData).toEqual(expect.arrayContaining([invalidServerResponse]));
      modelValidateFalse.dispose();
    });
  });

  describe('update method', () => {
    const serverUpdatedUser: User = {
      // Server may return more fields or confirm changes
      id: '1',
      name: 'Alice Updated By Server',
      email: 'alice.updated@example.com',
    };
    const updatePayload: Partial<User> = {
      name: 'Alice Updated By Server',
      // email might not be in payload if only name is changed
    };
    let initialCollectionDataUpdate: User[];
    let originalUserInCollection: User;

    beforeEach(() => {
      originalUserInCollection = {
        id: '1',
        name: 'Alice Original',
        email: 'alice@example.com',
      };
      initialCollectionDataUpdate = [
        JSON.parse(JSON.stringify(originalUserInCollection)), // Use a deep copy
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ];
      model.setData([...initialCollectionDataUpdate]);

      // Default mock for successful update
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverUpdatedUser),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);
    });

    it('should optimistically update item in collection, then confirm with server response', async () => {
      const dataEmissions: (User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      const promise = model.update('1', updatePayload);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(2); // Initial, Optimistic
      const optimisticData = dataEmissions[dataEmissions.length - 1] as User[];
      const updatedOptimisticItem = optimisticData.find((u) => u.id === '1');
      expect(updatedOptimisticItem?.name).toBe(updatePayload.name);
      // Email should be original if not in payload
      expect(updatedOptimisticItem?.email).toBe(originalUserInCollection.email);

      await promise;

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Server
      const finalData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(finalData.find((u) => u.id === '1')).toEqual(serverUpdatedUser);

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
    });

    it('should revert optimistic update in collection if update fails', async () => {
      const dataEmissions: (User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      const updateError = new Error('Update failed');
      mockFetcher.mockRejectedValue(updateError);

      await expect(model.update('1', updatePayload)).rejects.toThrow(updateError);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Reverted
      const revertedData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(revertedData.find((u) => u.id === '1')).toEqual(originalUserInCollection);
      expect(await model.error$.pipe(first()).toPromise()).toBe(updateError);
    });

    it('should optimistically update single item, then confirm with server response', async () => {
      const initialSingleUser = {
        id: 'single-1',
        name: 'Single Original',
        email: 'single@example.com',
      };
      const serverSingleUpdated = {
        ...initialSingleUser,
        name: 'Single Updated by Server',
      };
      const singleUpdatePayload = { name: 'Single Updated by Server' };

      const singleItemModel = new RestfulApiModel<User, typeof UserSchema>(
        // baseUrl,
        // endpoint,
        // mockFetcher, // This mockFetcher will be reused, make sure it's set for success
        // UserSchema,
        // JSON.parse(JSON.stringify(initialSingleUser))
        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: JSON.parse(JSON.stringify(initialSingleUser)), // Use a deep copy
        },
      );
      // Ensure mockFetcher is set for successful update for this specific model
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverSingleUpdated),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const dataEmissions: (User | null)[] = [];
      singleItemModel.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      await singleItemModel.update(initialSingleUser.id, singleUpdatePayload);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Server
      const optimisticData = dataEmissions[dataEmissions.length - 2];
      expect(optimisticData?.name).toBe(singleUpdatePayload.name);

      expect(await singleItemModel.data$.pipe(first()).toPromise()).toEqual(serverSingleUpdated);
      singleItemModel.dispose();
    });

    it('should revert optimistic update of single item if update fails', async () => {
      const initialSingleUserToFail = {
        id: 's-fail-1',
        name: 'Single Fail Original',
        email: 'sfail@example.com',
      };
      const singleUpdatePayloadFail = { name: 'Single Fail Updated' };
      const singleItemModelFail = new RestfulApiModel<User, typeof UserSchema>(
        // baseUrl,
        // endpoint,
        // mockFetcher,
        // UserSchema,
        // JSON.parse(JSON.stringify(initialSingleUserToFail))
        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: JSON.parse(JSON.stringify(initialSingleUserToFail)), // Use a deep copy
        },
      );
      const updateError = new Error('Single Update Failed');
      mockFetcher.mockRejectedValue(updateError); // Mock failure

      const dataEmissions: (User | null)[] = [];
      singleItemModelFail.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      await expect(singleItemModelFail.update(initialSingleUserToFail.id, singleUpdatePayloadFail)).rejects.toThrow(
        updateError,
      );

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Reverted
      const revertedData = dataEmissions[dataEmissions.length - 1];
      expect(revertedData).toEqual(initialSingleUserToFail);
      expect(await singleItemModelFail.error$.pipe(first()).toPromise()).toBe(updateError);
      singleItemModelFail.dispose();
    });

    it('should throw ZodError on update if server response is invalid and validateSchema is true', async () => {
      const initialUser: User = { id: '1', name: 'User Before Update', email: 'user@example.com' };
      const modelValidateTrue = new RestfulApiModel<User, typeof UserSchema>({
        baseUrl,
        endpoint,
        fetcher: mockFetcher,
        schema: UserSchema,
        initialData: initialUser,
        validateSchema: true,
      });

      const invalidServerResponse = createUserWithInvalidEmail('1', 'Updated Invalid');
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidServerResponse),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const updatePayload: Partial<User> = { name: 'Attempted Update' };
      await expect(modelValidateTrue.update('1', updatePayload)).rejects.toThrowError(ZodError);
      expect(await modelValidateTrue.error$.pipe(first()).toPromise()).toBeInstanceOf(ZodError);
      // Optimistic update should have been reverted
      expect(await modelValidateTrue.data$.pipe(first()).toPromise()).toEqual(initialUser);
      modelValidateTrue.dispose();
    });

    it('should update and set invalid updated item if validateSchema is false', async () => {
      const initialUser: User = { id: '1', name: 'User Before Update Valid', email: 'uservalid@example.com' };
      const modelValidateFalse = new RestfulApiModel<User, typeof UserSchema>({
        baseUrl,
        endpoint,
        fetcher: mockFetcher,
        schema: UserSchema,
        initialData: initialUser,
        validateSchema: false,
      });

      const invalidServerResponse = createInvalidUser('1', 'Updated Invalid Allowed') as User;
      mockFetcher.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidServerResponse),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as Response);

      const updatePayload: Partial<User> = { name: 'Attempted Update False' };
      await expect(modelValidateFalse.update('1', updatePayload)).resolves.toEqual(invalidServerResponse);
      expect(await modelValidateFalse.error$.pipe(first()).toPromise()).toBeNull();
      expect(await modelValidateFalse.data$.pipe(first()).toPromise()).toEqual(invalidServerResponse);
      modelValidateFalse.dispose();
    });
  });

  describe('delete method', () => {
    let initialCollectionDataDelete: User[];
    const userToDeleteId = '1';

    beforeEach(() => {
      initialCollectionDataDelete = [
        { id: userToDeleteId, name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' },
      ];
      model.setData([...initialCollectionDataDelete]);
      // Default mock for successful deletion (204 No Content)
      mockFetcher.mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.resolve(null), // Should not be called for 204
        text: () => Promise.resolve(''), // Should not be called for 204
        headers: new Headers({ 'Content-Type': 'application/json' }), // Content-Type might not be there for 204
      } as Response);
    });

    it('should optimistically delete item from collection and confirm', async () => {
      const dataEmissions: (User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      const promise = model.delete(userToDeleteId);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(2); // Initial, Optimistic
      const optimisticData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(optimisticData.find((u) => u.id === userToDeleteId)).toBeUndefined();
      expect(optimisticData.length).toBe(initialCollectionDataDelete.length - 1);

      await promise; // Wait for API call to resolve

      expect(mockFetcher).toHaveBeenCalledWith(`${baseUrl}/${endpoint}/${userToDeleteId}`, {
        method: 'DELETE',
      });
      // Final state should be the same as optimistic for delete
      const finalData = (await model.data$.pipe(first()).toPromise()) as User[];
      expect(finalData.find((u) => u.id === userToDeleteId)).toBeUndefined();
      expect(finalData.length).toBe(initialCollectionDataDelete.length - 1);
      expect(await model.isLoading$.pipe(first()).toPromise()).toBe(false);
      expect(await model.error$.pipe(first()).toPromise()).toBeNull();
    });

    it('should revert optimistic delete from collection if delete fails', async () => {
      const dataEmissions: (User[] | null)[] = [];
      model.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      const deleteError = new Error('Deletion failed');
      mockFetcher.mockRejectedValue(deleteError);

      await expect(model.delete(userToDeleteId)).rejects.toThrow(deleteError);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic, Reverted
      const revertedData = dataEmissions[dataEmissions.length - 1] as User[];
      expect(revertedData).toEqual(initialCollectionDataDelete);
      expect(await model.error$.pipe(first()).toPromise()).toBe(deleteError);
    });

    it('should optimistically set single item to null and confirm', async () => {
      const initialSingleUser = {
        id: 'single-del-1',
        name: 'Single Delete',
        email: 'sdel@example.com',
      };
      const singleItemModel = new RestfulApiModel<User, typeof UserSchema>(
        // baseUrl,
        // endpoint,
        // mockFetcher, // Reuses beforeEach mock for successful delete
        // UserSchema,
        // JSON.parse(JSON.stringify(initialSingleUser))
        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: JSON.parse(JSON.stringify(initialSingleUser)), // Use a deep copy
        },
      );

      const dataEmissions: (User | null)[] = [];
      singleItemModel.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      await singleItemModel.delete(initialSingleUser.id);

      // Emissions: Initial, Optimistic (which is also final for successful delete)
      expect(dataEmissions.length).toBeGreaterThanOrEqual(2);
      expect(dataEmissions[dataEmissions.length - 1]).toBeNull(); // Optimistic & Final state
      expect(await singleItemModel.data$.pipe(first()).toPromise()).toBeNull();
      singleItemModel.dispose();
    });

    it('should revert optimistic set to null of single item if delete fails', async () => {
      const initialSingleUserFail = {
        id: 's-del-fail-1',
        name: 'Single Del Fail',
        email: 'sdelfail@example.com',
      };
      const singleItemModelFail = new RestfulApiModel<User, typeof UserSchema>(
        // baseUrl,
        // endpoint,
        // mockFetcher,
        // UserSchema,
        // JSON.parse(JSON.stringify(initialSingleUserFail))

        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: JSON.parse(JSON.stringify(initialSingleUserFail)), // Use a deep copy
        },
      );
      const deleteError = new Error('Single Deletion Failed');
      mockFetcher.mockRejectedValue(deleteError); // Mock failure

      const dataEmissions: (User | null)[] = [];
      singleItemModelFail.data$.subscribe((data) => dataEmissions.push(data ? JSON.parse(JSON.stringify(data)) : null));

      await expect(singleItemModelFail.delete(initialSingleUserFail.id)).rejects.toThrow(deleteError);

      expect(dataEmissions.length).toBeGreaterThanOrEqual(3); // Initial, Optimistic(null), Reverted
      expect(dataEmissions[dataEmissions.length - 2]).toBeNull(); // Optimistic state was null
      expect(await singleItemModelFail.data$.pipe(first()).toPromise()).toEqual(initialSingleUserFail); // Reverted
      expect(await singleItemModelFail.error$.pipe(first()).toPromise()).toBe(deleteError);
      singleItemModelFail.dispose();
    });
  });

  describe('dispose method', () => {
    it('should call super.dispose and complete BaseModel observables', () => {
      const baseModelDisposeSpy = vi.spyOn(BaseModel.prototype, 'dispose');

      // Create a new model instance for this test to avoid interference
      const disposeModel = new RestfulApiModel<User | User[], typeof UserSchema>(
        // baseUrl, endpoint, mockFetcher, UserSchema
        {
          baseUrl,
          endpoint,
          fetcher: mockFetcher,
          schema: UserSchema,
          initialData: null, // Start with no initial data
        },
      );

      const dataCompleteSpy = vi.fn();
      const isLoadingCompleteSpy = vi.fn();
      const errorCompleteSpy = vi.fn();

      disposeModel.data$.subscribe({ complete: dataCompleteSpy });
      disposeModel.isLoading$.subscribe({ complete: isLoadingCompleteSpy });
      disposeModel.error$.subscribe({ complete: errorCompleteSpy });

      disposeModel.dispose();

      expect(baseModelDisposeSpy).toHaveBeenCalledTimes(1);
      expect(dataCompleteSpy).toHaveBeenCalledTimes(1);
      expect(isLoadingCompleteSpy).toHaveBeenCalledTimes(1);
      expect(errorCompleteSpy).toHaveBeenCalledTimes(1);

      // Attempt to use methods that change state to ensure no further actions
      disposeModel.setData(null); // Should not emit on data$
      disposeModel.setLoading(true); // Should not emit on isLoading$
      disposeModel.setError(new Error('test')); // Should not emit on error$

      // Verify no new next emissions after dispose (spies would have been called again)
      // This is implicitly tested by checking complete was called, as completed subjects don't emit.

      baseModelDisposeSpy.mockRestore(); // Clean up the spy
    });
  });
});
