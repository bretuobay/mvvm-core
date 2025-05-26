import React, { useState, useEffect } from 'react';
import { TodoItem, TodoItemData } from '../models/TodoItem';
import { TodoListViewModel } from '../viewmodels/TodoListViewModel';

interface TodoListItemProps {
  todo: TodoItem; 
  viewModel: TodoListViewModel;
}

export const TodoListItem: React.FC<TodoListItemProps> = ({ todo, viewModel }) => {
  const [itemData, setItemData] = useState<TodoItemData | null>(null);

  useEffect(() => {
    const dataSubscription = todo.data$.subscribe(data => {
      setItemData(data);
    });

    return () => {
      dataSubscription.unsubscribe();
    };
  }, [todo]);

  const handleToggle = () => {
    if (itemData) {
      viewModel.toggleTodoCommand.execute(itemData.id);
    }
  };

  if (!itemData) {
    return null;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '5px 0' }}>
      <input
        type="checkbox"
        checked={itemData.isCompleted}
        onChange={handleToggle}
        style={{ marginRight: '10px' }}
      />
      <span style={{ textDecoration: itemData.isCompleted ? 'line-through' : 'none' }}>
        {itemData.text}
      </span>
    </div>
  );
};
