(function () {
  "use strict";

  // Snapshot equality / cloning use JSON because every undoable field in this
  // app is JSON-serializable (numbers, strings, arrays of primitives, plain
  // objects). Keeps the manager free of any state schema knowledge.
  function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function snapshotsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Generic, schema-agnostic undo/redo stack with debounced coalescing.
  //
  // The caller supplies two callbacks:
  //   - snapshot(): builds a plain-object capture of every undoable field
  //   - apply(snap): writes a snapshot back into app state and UI
  //
  // schedule() should be called on every editable user action; consecutive
  // calls inside debounceMs coalesce into one history entry. commitNow()
  // freezes any pending change immediately — undo() / redo() do that
  // automatically before walking the stacks so the most recent edit is
  // always reachable.
  class HistoryStack {
    constructor({ snapshot, apply, debounceMs = 400, limit = 100, onChange }) {
      this.snapshot = snapshot;
      this.apply = apply;
      this.debounceMs = debounceMs;
      this.limit = limit;
      this.onChange = typeof onChange === "function" ? onChange : null;
      this.undoStack = [];
      this.redoStack = [];
      this.last = snapshot();
      this.timer = null;
      this.suspended = 0;
    }

    notify() {
      if (this.onChange) this.onChange(this);
    }

    commitNow() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.suspended > 0) return false;
      const cur = this.snapshot();
      if (snapshotsEqual(cur, this.last)) return false;
      this.undoStack.push(this.last);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
      this.last = cur;
      this.notify();
      return true;
    }

    schedule() {
      if (this.suspended > 0) return;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.commitNow(), this.debounceMs);
    }

    cancelScheduled() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }

    // Wrap a programmatic state mutation so it doesn't pollute history.
    // Used by apply() so that writing snapshots back into the UI doesn't
    // schedule a fresh commit.
    runSilently(fn) {
      this.suspended += 1;
      try {
        fn();
      } finally {
        this.suspended -= 1;
      }
    }

    undo() {
      this.commitNow();
      if (this.undoStack.length === 0) return false;
      const prev = this.undoStack.pop();
      this.redoStack.push(this.last);
      this.last = prev;
      this.runSilently(() => this.apply(deepClone(prev)));
      this.notify();
      return true;
    }

    redo() {
      this.commitNow();
      if (this.redoStack.length === 0) return false;
      const next = this.redoStack.pop();
      this.undoStack.push(this.last);
      this.last = next;
      this.runSilently(() => this.apply(deepClone(next)));
      this.notify();
      return true;
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    // Re-baseline the history without exposing prior states as undoable —
    // used after defaults are restored or after a fresh connect.
    reset() {
      this.cancelScheduled();
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.last = this.snapshot();
      this.notify();
    }
  }

  window.HvccpsHistory = Object.freeze({ HistoryStack, deepClone, snapshotsEqual });
})();
