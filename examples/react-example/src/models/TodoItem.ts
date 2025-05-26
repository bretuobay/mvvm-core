import { BaseModel } from '../../../../src/models/BaseModel';

export interface TodoItemData {
  id: string;
  text: string;
  isCompleted: boolean;
}

export class TodoItem extends BaseModel<TodoItemData, any> {
  constructor(id: string, text: string, isCompleted: boolean = false) {
    super({ id, text, isCompleted });
  }

  public get id(): string {
    return this._data$.value!.id;
  }

  public get text(): string {
    return this._data$.value!.text;
  }

  public setText(newText: string): void {
    if (this._data$.value) {
      this.setData({ ...this._data$.value, text: newText });
    }
  }

  public get isCompleted(): boolean {
    return this._data$.value!.isCompleted;
  }

  public toggleCompletion(): void {
    if (this._data$.value) {
      this.setData({ ...this._data$.value, isCompleted: !this._data$.value.isCompleted });
    }
  }
}
