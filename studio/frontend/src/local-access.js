export const DEFAULT_LOCAL_ACCESS = 'full-read';
export const LOCAL_ACCESS_MODES = new Set(['full-read', 'none']);

function key(boardId, taskId) {
  return `hobot-code.local-access.${boardId || 'board'}.${taskId || 'task'}`;
}

export function readLocalAccess(storage, boardId, taskId) {
  try {
    const value = storage?.getItem(key(boardId, taskId));
    return LOCAL_ACCESS_MODES.has(value) ? value : DEFAULT_LOCAL_ACCESS;
  } catch {
    return DEFAULT_LOCAL_ACCESS;
  }
}

export function saveLocalAccess(storage, boardId, taskId, value) {
  if (!LOCAL_ACCESS_MODES.has(value)) throw new Error('Local access mode is invalid.');
  try {
    storage?.setItem(key(boardId, taskId), value);
  } catch {
    // The in-memory task choice remains effective for this Studio session.
  }
  return value;
}
