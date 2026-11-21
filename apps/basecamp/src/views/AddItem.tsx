// AddItem (R4.10): a text field and an Add button. Enter or the button creates the item.
import { useState, type FormEvent, type ReactNode } from 'react';
import { TARGET } from './target.ts';

export function AddItem(p: { onAdd(name: string): void }): ReactNode {
  const [text, setText] = useState('');
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const name = text.trim();
    if (name === '') return;
    p.onAdd(name);
    setText('');
  };
  return (
    <form className="bc-add" onSubmit={submit}>
      <input
        type="text"
        aria-label="Add an item"
        placeholder="Add an item"
        style={TARGET}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" style={TARGET}>
        Add
      </button>
    </form>
  );
}
