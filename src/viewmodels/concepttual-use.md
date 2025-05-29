```typescript
// --- 1. Define your specific Model and ViewModel ---
// src/models/user.api.model.ts
import { RestfulApiModel, Fetcher } from 'your-library/models/RestfulApiModel';
import { z } from 'zod';

export const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string().email() });
export type User = z.infer<typeof UserSchema>;

const myFetcher: Fetcher = async (url, options) => { /* ... fetch logic ... */ return new Response(); };

export class UserApiModel extends RestfulApiModel<User[], typeof UserSchema> {
    constructor() {
        super('https://api.yourapp.com', 'users', myFetcher, z.array(UserSchema));
    }
}

// src/viewmodels/user.list.viewmodel.ts
import { RestfulApiViewModel } from 'your-library/viewmodels/RestfulApiViewModel';
import { User, UserApiModel, UserSchema } from '../models/user.api.model';

export class UserListViewModel extends RestfulApiViewModel<User[], typeof UserSchema> {
    constructor(userApiModel: UserApiModel) {
        super(userApiModel);
    }

    // You could add specific UI-related methods here, e.g.:
    // public filterUsers(query: string) { /* ... */ }
    // public sortBy(key: keyof User) { /* ... */ }
}

// --- 2. Using it in a React Component (Example) ---
// src/components/UserList.tsx
import React, { useEffect, useState } from 'react';
import { UserApiModel } from '../models/user.api.model';
import { UserListViewModel } from '../viewmodels/user.list.viewmodel';
import { useObservable } from 'react-rxjs-hooks'; // Hypothetical hook for RxJS observables

const userApiModel = new UserApiModel(); // Instantiate once (consider DI for real apps)
const userListViewModel = new UserListViewModel(userApiModel);

const UserList: React.FC = () => {
    const users = useObservable(userListViewModel.data$, []); // Default to empty array
    const isLoading = useObservable(userListViewModel.isLoading$, false);
    const error = useObservable(userListViewModel.error$, null);
    const fetchUsersCommand = userListViewModel.fetchCommand;
    const createUserCommand = userListViewModel.createCommand;

    useEffect(() => {
        // Fetch users when the component mounts
        fetchUsersCommand.execute();
    }, [fetchUsersCommand]);

    const handleCreateUser = () => {
        createUserCommand.execute({ name: 'New User', email: 'new@example.com' });
    };

    if (isLoading) return <div>Loading users...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <div>
            <h1>User List</h1>
            <button
                onClick={handleCreateUser}
                disabled={useObservable(createUserCommand.isExecuting$, false)}
            >
                {useObservable(createUserCommand.isExecuting$, false) ? 'Creating...' : 'Add New User'}
            </button>
            <ul>
                {users && users.map(user => (
                    <li key={user.id}>
                        {user.name} ({user.email})
                        {/* Example: Delete button */}
                        <button onClick={() => userListViewModel.deleteCommand.execute(user.id)}>Delete</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default UserList;
```