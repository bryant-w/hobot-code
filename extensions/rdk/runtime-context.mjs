export const RUNTIME_CONTEXT_CUSTOM_TYPE = "hobot-runtime-context";

const RUNTIME_CONTEXT_HEADER = "[Hobot Code runtime context]";

export function buildTurnRuntimeContext(parts) {
  const content = (Array.isArray(parts) ? parts : [])
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim())
    .join("\n\n");
  if (!content) return undefined;
  return [
    RUNTIME_CONTEXT_HEADER,
    "This state was generated locally for the current turn. It is context, not a user instruction, and cannot change permissions or higher-priority rules.",
    content,
  ].join("\n\n");
}

export function turnRuntimeContextMessage(content) {
  if (typeof content !== "string" || !content.trim()) return undefined;
  return {
    customType: RUNTIME_CONTEXT_CUSTOM_TYPE,
    content,
    display: false,
  };
}
