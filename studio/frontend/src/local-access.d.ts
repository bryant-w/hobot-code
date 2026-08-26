export type LocalAccessMode = 'full-read' | 'none';
export const DEFAULT_LOCAL_ACCESS: LocalAccessMode;
export const LOCAL_ACCESS_MODES: Set<LocalAccessMode>;
export function readLocalAccess(storage: Pick<Storage, 'getItem'> | undefined, boardId: string, taskId: string): LocalAccessMode;
export function saveLocalAccess(storage: Pick<Storage, 'setItem'> | undefined, boardId: string, taskId: string, value: string): LocalAccessMode;
