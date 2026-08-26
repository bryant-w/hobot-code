export type AccessModeInput = {
  permissionMode?: 'review' | 'ask' | 'auto-review' | 'developer';
  sandboxMode?: 'review' | 'workspace' | 'system' | 'off';
  networkMode?: 'shared' | 'model-only' | 'offline';
  localAccessMode?: 'full-read' | 'none';
};

export function accessModePresentation(input?: AccessModeInput): {
  label: string;
  tone: 'standard' | 'elevated' | 'danger';
  summary: string;
};
