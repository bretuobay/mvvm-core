# MVVM Web Library

A framework-agnostic web library for building robust client-side applications using the Model-View-ViewModel (MVVM) pattern. This library leverages the power of **RxJS** for reactive data flow and **Zod** for strong data validation, aiming to simplify state management and API interactions across various frontend frameworks like React, Angular, and Vue.

---

## Key Features

* **MVVM Core:** Provides `BaseModel` and `BaseViewModel` for structured application development.
* **Reactive Data Flow:** Built entirely on **RxJS**, ensuring all data, loading states, and errors are reactive observables.
* **Strong Data Validation:** Integrates **Zod** schemas for compile-time and runtime data validation.
* **RESTful API Management:** `RestfulApiModel` simplifies CRUD operations with **optimistic updates**, acting as a local data store, managing loading states, and handling errors automatically.
* **Command Pattern:** Offers a `Command` utility for encapsulating UI actions, including `canExecute` and `isExecuting` states, for clean UI-ViewModel separation. Implements `IDisposable`.
* **Observable Collections:** `ObservableCollection` provides reactive list management, notifying views of granular changes (add, remove, update) for efficient rendering.
* **Resource Management:** Core components like `BaseModel` and `Command` implement `IDisposable` for proper resource cleanup (e.g., completing RxJS Subjects), helping prevent memory leaks.
* **Framework Agnostic:** Designed with no direct UI framework dependencies, allowing seamless integration with React, Angular, Vue, and others.
* **Client-Heavy App Focused:** Ideal for building complex dashboards, forms, and data-intensive single-page applications.

---

## Getting Started

### Installation

To install the library, you'll need `npm` or `yarn`.

```bash
npm install your-library-name rxjs zod
# or
yarn add your-library-name rxjs zod
```


You'll also need TypeScript configured in your project.

## Basic Usage
1. Defining a Model with Zod

```typescript
// src/models/user.model.ts
import { BaseModel } from 'your-library-name/models/BaseModel'; // Adjust import path
import { z } from 'zod';

export const UserSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(3),
    email: z.string().email(),
    age: z.number().int().positive().optional(),
});

export type User = z.infer<typeof UserSchema>;

export class UserModel extends BaseModel<User, typeof UserSchema> {
    constructor(initialData?: User) {
        super(initialData || null, UserSchema);
    }
}
```

2. Creating a ViewModel
```typescript
// src/viewmodels/user.viewmodel.ts
import { BaseViewModel } from 'your-library-name/viewmodels/BaseViewModel'; // Adjust import path
import { UserModel } from '../models/user.model';

export class UserViewModel extends BaseViewModel<UserModel> {
    constructor(model: UserModel) {
        super(model);
    }

    // You can add computed properties (RxJS operators) or methods here
    get displayName$() {
        return this.data$.pipe(
            map(user => user ? `User: ${user.name}` : 'No user selected')
        );
    }
}
```

3. Using RestfulApiModel for CRUD

```typescript
// src/models/user.api.model.ts
import { RestfulApiModel, Fetcher } from 'your-library-name/models/RestfulApiModel'; // Adjust import path
import { User, UserSchema } from './user.model';

// Example fetcher (can be window.fetch, axios, etc.)
const myCustomFetcher: Fetcher = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response; // Return response object, RestfulApiModel will parse JSON
};

export class UserApiModels extends RestfulApiModel<User[], typeof UserSchema> {
    constructor() {
        // Assuming your API returns an array of users for the base endpoint
        super('[https://api.yourapp.com](https://api.yourapp.com)', 'users', myCustomFetcher, z.array(UserSchema));
    }
}
```

```typescript
// Example usage in a component/service
async function loadUsers() {
    const userApi = new UserApiModels();
    userApi.data$.subscribe(users => {
        console.log('Current users:', users);
    });
    userApi.isLoading$.subscribe(loading => {
        console.log('Loading users:', loading);
    });
    userApi.error$.subscribe(error => {
        if (error) console.error('Error loading users:', error);
    });

    try {
        await userApi.fetch(); // Fetches all users

        // Create example
        const newUserPayload = { name: 'New User', email: 'new@example.com' }; // No ID needed if server generates
        const createdUser = await userApi.create(newUserPayload);
        if (createdUser) {
            console.log('Created User:', createdUser); // Has server-assigned ID

            // Update example
            const updatedUser = await userApi.update(createdUser.id, { name: 'Updated User Name' });
            console.log('Updated User:', updatedUser);

            // Delete example
            if (updatedUser) {
                await userApi.delete(updatedUser.id);
                console.log('User deleted successfully.');
            }
        }
    } catch (e) {
        // Errors from create, update, delete are re-thrown after setting model.error$
        // and reverting optimistic updates.
        console.error('API operation failed:', e, userApi.error$.getValue());
    } finally {
        // It's good practice to dispose of models/commands when they are no longer needed,
        // especially if they are long-lived and manage subscriptions.
        // userApi.dispose(); 
    }
}
```

4. Implementing Commands

```typescript
// src/viewmodels/auth.viewmodel.ts
import { Command } from 'your-library-name/commands/Command'; // Adjust import path
import { BehaviorSubject } from 'rxjs';

export class AuthViewModel {
    private _isLoggedIn = new BehaviorSubject(false);
    public isLoggedIn$ = this._isLoggedIn.asObservable();

    public loginCommand: Command<string, boolean>; // param: password, result: success boolean

    constructor() {
        this.loginCommand = new Command(
            async (password: string) => {
                console.log(`Attempting login with password: ${password}`);
                // Simulate API call
                return new Promise(resolve => {
                    setTimeout(() => {
                        const success = password === 'secret';
                        this._isLoggedIn.next(success);
                        resolve(success);
                    }, 1000);
                });
            },
            // canExecute$ Observable - login is only possible if not already logged in
            this.isLoggedIn$.pipe(map(loggedIn => !loggedIn))
        );
    }

    // In a React/Vue/Angular component:
    // <button
    //   onClick={() => authViewModel.loginCommand.execute('myPassword')}
    //   disabled={!(await authViewModel.loginCommand.canExecute$.pipe(first()).toPromise()) || (await authViewModel.loginCommand.isExecuting$.pipe(first()).toPromise())}
    // >
    //   { (await authViewModel.loginCommand.isExecuting$.pipe(first()).toPromise()) ? 'Logging in...' : 'Login' }
    // </button>
}
```

5. Using ObservableCollection
```typescript
// src/viewmodels/todos.viewmodel.ts
import { ObservableCollection } from 'your-library-name/collections/ObservableCollection'; // Adjust import path
import { map } from 'rxjs/operators';

interface Todo {
    id: string;
    text: string;
    completed: boolean;
}

export class TodosViewModel {
    public todos: ObservableCollection<Todo>;

    constructor() {
        this.todos = new ObservableCollection([
            { id: '1', text: 'Learn MVVM', completed: false },
            { id: '2', text: 'Build awesome app', completed: true },
        ]);
    }

    addTodo(text: string) {
        const newTodo: Todo = { id: Date.now().toString(), text, completed: false };
        this.todos.add(newTodo);
    }

    toggleTodo(id: string) {
        this.todos.update(
            todo => todo.id === id,
            { ...this.todos.toArray().find(t => t.id === id)!, completed: !this.todos.toArray().find(t => t.id === id)!.completed }
        );
    }

    removeCompleted() {
        this.todos.remove(todo => todo.completed);
    }

    // In a React/Vue/Angular component:
    // <ul *ngIf="todos.items$ | async as todoList">
    //   <li *ngFor="let todo of todoList">
    //     {{ todo.text }} ({{ todo.completed ? 'Completed' : 'Pending' }})
    //   </li>
    // </ul>
}
```