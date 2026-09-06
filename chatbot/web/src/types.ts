export interface ServerStatusInfo {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ToolsSummaryInfo {
  total: number;
  byServer: { server: string; count: number }[];
}

export type ServerEvent =
  | { type: "server_status"; servers: ServerStatusInfo[] }
  | { type: "tools_summary"; total: number; byServer: { server: string; count: number }[] }
  | { type: "classmates_status"; enabled: boolean; toggling: boolean }
  | { type: "auth_status"; required: boolean; authenticated: boolean }
  | { type: "assistant_message"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_blocked"; name: string; reason: string }
  | { type: "tool_error"; name: string; message: string }
  | { type: "turn_complete" }
  | { type: "fatal_error"; message: string };
