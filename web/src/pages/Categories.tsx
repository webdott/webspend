import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Category } from '@webspend/shared';
import { api } from '../api/client.ts';
import { keys, useCategories, useInvalidateLedger, useSummary } from '../api/hooks.ts';
import { EmptyState, ErrorState, LoadingState, Notice, errorMessage } from '../components/ui.tsx';
import { currentMonth } from '../lib/dates.ts';

export function Categories() {
  const qc = useQueryClient();
  const cats = useCategories();
  const summary = useSummary(currentMonth());
  const invalidate = useInvalidateLedger();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: keys.categories });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createCategory({ name: name.trim() });
      setName('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function rename(c: Category, next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === c.name) return;
    setError(null);
    try {
      await api.updateCategory(c.id, { name: trimmed });
      await Promise.all([refresh(), invalidate()]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(c: Category) {
    if (!window.confirm(`Remove “${c.name}”? Transactions in it will need a category again.`))
      return;
    setError(null);
    try {
      await api.deleteCategory(c.id);
      await Promise.all([refresh(), invalidate()]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div>
        <h1 className="page-title">Categories</h1>
        <p className="page-sub">
          One list, used on iPhone, Mac and web. Bank alerts rarely say what a payment was for, so
          you choose from here.
        </p>
      </div>

      <form className="inline-form" onSubmit={add}>
        <label htmlFor="new-cat" className="visually-hidden">
          New category
        </label>
        <input
          id="new-cat"
          className="input"
          placeholder="New category"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
          Add
        </button>
      </form>
      {error ? <Notice kind="error">{error}</Notice> : null}

      <div className="card">
        {cats.isPending ? (
          <LoadingState />
        ) : cats.isError ? (
          <ErrorState error={cats.error} retry={() => cats.refetch()} />
        ) : cats.data.categories.length === 0 ? (
          <EmptyState>No categories yet. Add a few above, like Food or Transport.</EmptyState>
        ) : (
          <ul className="list list--scroll" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {cats.data.categories.map((c) => (
              <CategoryItem
                key={c.id}
                c={c}
                onRename={(n) => rename(c, n)}
                onRemove={() => remove(c)}
              />
            ))}
          </ul>
        )}
      </div>

      {summary.data ? (
        <Link
          to="/transactions?filter=uncategorised"
          className="card row row--between"
          style={{ color: 'inherit' }}
        >
          <span className="accent-text" style={{ fontWeight: 500 }}>
            Needs a category
          </span>
          <span className="muted small">
            {summary.data.uncategorisedCount === 0
              ? 'Nothing to sort'
              : `${summary.data.uncategorisedCount} to sort`}{' '}
            ›
          </span>
        </Link>
      ) : null}
    </div>
  );
}

function CategoryItem({
  c,
  onRename,
  onRemove,
}: {
  c: Category;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.name);
  return (
    <li className="list-item">
      {editing ? (
        <form
          className="inline-form"
          style={{ flex: 1 }}
          onSubmit={(e) => {
            e.preventDefault();
            onRename(draft);
            setEditing(false);
          }}
        >
          <label className="visually-hidden" htmlFor={`cat-${c.id}`}>
            Rename {c.name}
          </label>
          <input
            id={`cat-${c.id}`}
            className="input"
            autoFocus
            maxLength={60}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          />
          <button type="submit" className="btn btn--sm btn--primary">
            Save
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setDraft(c.name);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span style={{ fontWeight: 500 }}>{c.name}</span>
          <span className="list-item__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setEditing(true)}
            >
              Rename
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={onRemove}>
              Remove
            </button>
          </span>
        </>
      )}
    </li>
  );
}
