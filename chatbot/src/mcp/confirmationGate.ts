/**
 * Guards write tools that follow a "preview, then confirm" pattern (e.g. the
 * hotel server's crear_reservacion: called once without `confirmado` it only
 * previews the booking, and only writes when called again with
 * `confirmado: true`).
 *
 * The hotel-mcp-server README explicitly warns that a host must not let the
 * model chain the preview and the confirmed write back to back in the same
 * reply - only the host can see that a real user message arrived in between,
 * so this gate is the chatbot's responsibility, not the tool's. Without it, a
 * model told to "hurry" can call both in the same turn and leave the user
 * with a booking they never actually approved.
 */
export class ConfirmationGate {
  private pendingSinceTurn: number | null = null;
  private currentTurn = 0;

  /** Call once per new user message, before running the agent loop. */
  startNewTurn(): void {
    this.currentTurn += 1;
  }

  /** Record that a tool call returned a pending confirmation (a preview). */
  markPending(): void {
    this.pendingSinceTurn = this.currentTurn;
  }

  clearPending(): void {
    this.pendingSinceTurn = null;
  }

  /** True once the user has had at least one whole turn to react to the preview. */
  isConfirmedByUser(): boolean {
    return this.pendingSinceTurn !== null && this.pendingSinceTurn < this.currentTurn;
  }
}

/** Best-effort read of a boolean field from a tool's structured or text JSON result. */
export function readBooleanField(result: unknown, field: string): boolean | undefined {
  const candidate = extractPayload(result);
  const value = candidate?.[field];
  return typeof value === "boolean" ? value : undefined;
}

function extractPayload(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object") return undefined;
  const withContent = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }> };

  if (withContent.structuredContent && typeof withContent.structuredContent === "object") {
    return withContent.structuredContent as Record<string, unknown>;
  }
  const textBlock = withContent.content?.find((block) => block.type === "text");
  if (!textBlock?.text) return undefined;
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return undefined;
  }
}
