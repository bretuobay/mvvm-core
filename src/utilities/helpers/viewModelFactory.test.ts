import { z } from 'zod';
import { createReactiveViewModel, ViewModelFactoryConfig } from './viewModelFactory';
import { RestfulApiModel, Fetcher } from '../../models/RestfulApiModel';
import { RestfulApiViewModel } from '../../viewmodels/RestfulApiViewModel';

// Mock a native fetcher function
const mockFetcher: Fetcher = async (url, options) => {
  console.log(`Mock fetcher called with URL: ${url} and options:`, options);
  // Simulate a successful response for schema validation purposes
  if (options?.method === 'POST' || options?.method === 'PUT') {
    // For create/update, return what was sent, assuming schema matches
    if (options.body) {
        // Check if body is a string and parse it if so
        const requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        return {
            ok: true,
            status: 200,
            json: async () => requestBody,
            text: async () => JSON.stringify(requestBody),
            headers: new Headers({'Content-Type': 'application/json'})
        } as any; // Using 'as any' to simplify mock Response structure
    }
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: '1', name: 'Test Item' }), // Default GET response
    text: async () => JSON.stringify({ id: '1', name: 'Test Item' }),
    headers: new Headers({'Content-Type': 'application/json'})
  } as any; // Using 'as any' to simplify mock Response structure
};

// Define a simple Zod schema for testing
const TestItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});
type TestItemData = z.infer<typeof TestItemSchema>;

// Define a Zod schema for a list of test items
const TestItemListSchema = z.array(TestItemSchema);
type TestItemListData = z.infer<typeof TestItemListSchema>;


describe('createReactiveViewModel', () => {
  // Configuration for a single item ViewModel
  const singleItemConfig: ViewModelFactoryConfig<TestItemData, typeof TestItemSchema> = {
    modelConfig: {
      baseUrl: 'https://api.test.com',
      endpoint: 'items',
      fetcher: mockFetcher,
      initialData: null,
      validateSchema: true,
    },
    schema: TestItemSchema,
  };

  // Configuration for a list of items ViewModel
  const itemListConfig: ViewModelFactoryConfig<TestItemListData, typeof TestItemListSchema> = {
    modelConfig: {
      baseUrl: 'https://api.test.com',
      endpoint: 'items',
      fetcher: mockFetcher,
      initialData: [],
      validateSchema: true,
    },
    schema: TestItemListSchema,
  };

  it('should create a RestfulApiViewModel instance for a single item', () => {
    const viewModel = createReactiveViewModel(singleItemConfig);
    expect(viewModel).toBeInstanceOf(RestfulApiViewModel);
  });

  it('should create a RestfulApiViewModel instance for a list of items', () => {
    const viewModel = createReactiveViewModel(itemListConfig);
    expect(viewModel).toBeInstanceOf(RestfulApiViewModel);
  });

  it('should have a valid RestfulApiModel instance in the ViewModel', () => {
    const viewModel = createReactiveViewModel(singleItemConfig);
    expect(viewModel['model']).toBeInstanceOf(RestfulApiModel);
  });

  it('should configure the underlying RestfulApiModel correctly', () => {
    const viewModel = createReactiveViewModel(singleItemConfig);
    const model = viewModel['model'] as RestfulApiModel<TestItemData, typeof TestItemSchema>;

    // Access private members for testing purposes (common in Jest tests)
    expect(model['baseUrl']).toBe('https://api.test.com');
    expect(model['endpoint']).toBe('items');
    expect(model['fetcher']).toBe(mockFetcher);
    expect(model['_schema']).toBe(TestItemSchema); // Note: BaseModel stores schema in _schema
    expect(model['_shouldValidateSchema']).toBe(true);
  });

  it('should use initialData if provided', (done) => {
    const initial: TestItemData = { id: 'init', name: 'Initial Item' };
    const configWithInitialData: ViewModelFactoryConfig<TestItemData, typeof TestItemSchema> = {
      modelConfig: {
        ...singleItemConfig.modelConfig,
        initialData: initial,
      },
      schema: TestItemSchema,
    };
    const viewModel = createReactiveViewModel(configWithInitialData);
    viewModel.data$.subscribe(data => {
      expect(data).toEqual(initial);
      done();
    });
  });

  it('ViewModel should expose data$, isLoading$, and error$ observables', () => {
    const viewModel = createReactiveViewModel(singleItemConfig);
    expect(viewModel.data$).toBeDefined();
    expect(viewModel.isLoading$).toBeDefined();
    expect(viewModel.error$).toBeDefined();
    // Check if they are observables (basic check)
    expect(typeof viewModel.data$.subscribe).toBe('function');
    expect(typeof viewModel.isLoading$.subscribe).toBe('function');
    expect(typeof viewModel.error$.subscribe).toBe('function');
  });

  it('ViewModel should expose CRUD commands', () => {
    const viewModel = createReactiveViewModel(singleItemConfig);
    expect(viewModel.fetchCommand).toBeDefined();
    expect(viewModel.createCommand).toBeDefined();
    expect(viewModel.updateCommand).toBeDefined();
    expect(viewModel.deleteCommand).toBeDefined();
    // Check if they are Command instances (basic check)
    expect(viewModel.fetchCommand.execute).toBeDefined();
    expect(viewModel.createCommand.execute).toBeDefined();
    expect(viewModel.updateCommand.execute).toBeDefined();
    expect(viewModel.deleteCommand.execute).toBeDefined();
  });

  it('should correctly pass validateSchema: false to the model', () => {
    const configNoValidate: ViewModelFactoryConfig<TestItemData, typeof TestItemSchema> = {
        modelConfig: {
            ...singleItemConfig.modelConfig,
            validateSchema: false,
        },
        schema: TestItemSchema,
    };
    const viewModel = createReactiveViewModel(configNoValidate);
    const model = viewModel['model'] as RestfulApiModel<TestItemData, typeof TestItemSchema>;
    expect(model['_shouldValidateSchema']).toBe(false);
  });

  it('should default validateSchema to true if not provided in modelConfig', () => {
    const configNoValidateFlag: ViewModelFactoryConfig<TestItemData, typeof TestItemSchema> = {
        modelConfig: {
            baseUrl: 'https://api.test.com',
            endpoint: 'items',
            fetcher: mockFetcher,
            initialData: null,
            // validateSchema is omitted
        },
        schema: TestItemSchema,
    };
    const viewModel = createReactiveViewModel(configNoValidateFlag);
    const model = viewModel['model'] as RestfulApiModel<TestItemData, typeof TestItemSchema>;
    // Default is true in RestfulApiModel constructor if undefined
    expect(model['_shouldValidateSchema']).toBe(true);
  });

});
