export type CodexLbReasoningEffort = "low" | "medium" | "high";

export const defaultCodexLbBaseUrl = "https://codex-lb-production-6b47.up.railway.app/v1";
export const defaultCodexLbModel = "gpt-5.4";
export const defaultCodexLbReasoningEffort: CodexLbReasoningEffort = "high";

export function codexLbReasoningEffort(value = process.env.CODEX_LB_REASONING_EFFORT): CodexLbReasoningEffort {
  return value === "low" || value === "medium" || value === "high" ? value : defaultCodexLbReasoningEffort;
}
