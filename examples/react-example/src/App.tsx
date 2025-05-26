import React, { useEffect } from 'react';
import { TodoListViewModel } from './viewmodels/TodoListViewModel';
import { AddTodoForm } from './components/AddTodoForm';
import { TodoList } from './components/TodoList';
import './App.css';

const todoListViewModel = new TodoListViewModel();

function App() {
  useEffect(() => {
    return () => {
      todoListViewModel.dispose();
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>React Todo App (MVVM)</h1>
      </header>
      <main>
        <AddTodoForm viewModel={todoListViewModel} />
        <TodoList viewModel={todoListViewModel} />
      </main>
    </div>
  );
}

export default App;
