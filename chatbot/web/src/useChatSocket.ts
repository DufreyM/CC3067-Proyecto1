import { useEffect, useRef, useState } from "react";
import type { BubbleItemType } from "@ant-design/x";
import type { ServerEvent, ServerStatusInfo, ToolsSummaryInfo } from "./types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8787/ws";

let nextKey = 0;
const newKey = () => `msg-${nextKey++}`;

function truncate(value: unknown, maxLength = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

/**
 * Owns the WebSocket connection to the chatbot backend and turns its events
 * into Bubble.List items, so App.tsx only deals with rendering.
 */
export function useChatSocket() {
  const [connected, setConnected] = useState(false);
  const [servers, setServers] = useState<ServerStatusInfo[]>([]);
  const [toolsSummary, setToolsSummary] = useState<ToolsSummaryInfo | null>(null);
  const [items, setItems] = useState<BubbleItemType[]>([]);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const message: ServerEvent = JSON.parse(event.data);
      switch (message.type) {
        case "server_status":
          setServers(message.servers);
          break;
        case "tools_summary":
          setToolsSummary({ total: message.total, byServer: message.byServer });
          break;
        case "assistant_message":
          setItems((prev) => [...prev, { key: newKey(), role: "ai", content: message.text }]);
          break;
        case "tool_call":
          setItems((prev) => [
            ...prev,
            { key: newKey(), role: "tool", content: `${message.name} ${truncate(message.input)}` },
          ]);
          break;
        case "tool_blocked":
          setItems((prev) => [
            ...prev,
            { key: newKey(), role: "tool-blocked", content: `${message.name}: ${message.reason}` },
          ]);
          break;
        case "tool_error":
          setItems((prev) => [
            ...prev,
            { key: newKey(), role: "tool-error", content: `${message.name}: ${message.message}` },
          ]);
          break;
        case "turn_complete":
          setWaitingForReply(false);
          break;
        case "fatal_error":
          setItems((prev) => [...prev, { key: newKey(), role: "tool-error", content: message.message }]);
          setWaitingForReply(false);
          break;
      }
    };

    return () => ws.close();
  }, []);

  function sendUserMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return;

    setItems((prev) => [...prev, { key: newKey(), role: "user", content: trimmed }]);
    setWaitingForReply(true);
    wsRef.current.send(JSON.stringify({ type: "user_message", text: trimmed }));
  }

  return { connected, servers, toolsSummary, items, waitingForReply, sendUserMessage };
}
