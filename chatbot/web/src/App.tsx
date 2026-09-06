import { useState } from "react";
import { Bubble, Sender } from "@ant-design/x";
import type { BubbleListProps } from "@ant-design/x";
import { Alert, Avatar, Badge, Button, Card, Flex, Input, Layout, Space, Switch, Tag, Typography, theme } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LockOutlined,
  RobotOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { useChatSocket } from "./useChatSocket";

const { Header, Content, Footer } = Layout;
const { Text, Title } = Typography;

const roles: NonNullable<BubbleListProps["role"]> = {
  user: {
    placement: "end",
    variant: "filled",
    avatar: <Avatar icon={<UserOutlined />} style={{ background: "#1677ff" }} />,
  },
  ai: {
    placement: "start",
    variant: "filled",
    avatar: <Avatar icon={<RobotOutlined />} style={{ background: "#52c41a" }} />,
    contentRender: (content) => (
      <div className="md">
        <ReactMarkdown>{String(content)}</ReactMarkdown>
      </div>
    ),
  },
  tool: {
    placement: "start",
    variant: "outlined",
    avatar: <Avatar icon={<ToolOutlined />} style={{ background: "#faad14" }} />,
    style: { fontFamily: "monospace", fontSize: 12, opacity: 0.9, maxWidth: 640 },
  },
  "tool-blocked": {
    placement: "start",
    variant: "outlined",
    avatar: <Avatar icon={<ToolOutlined />} style={{ background: "#faad14" }} />,
    style: { fontFamily: "monospace", fontSize: 12, borderColor: "#faad14", color: "#ad6800" },
  },
  "tool-error": {
    placement: "start",
    variant: "outlined",
    avatar: <Avatar icon={<ToolOutlined />} style={{ background: "#ff4d4f" }} />,
    style: { fontFamily: "monospace", fontSize: 12, borderColor: "#ff4d4f", color: "#cf1322" },
  },
};

const EXAMPLE_PROMPTS: { server: string; example: string }[] = [
  { server: "hotel", example: "¿cuantas habitaciones libres hay hoy?" },
  { server: "docfinder", example: "¿donde esta la documentacion de autenticacion del proyecto X?" },
  { server: "rrhh", example: "¿cuantos dias de vacaciones tiene el empleado 5?" },
  { server: "brewops", example: "recomiendame un cafe floral para V60" },
];
const DEFAULT_PLACEHOLDER = "Escribe tu mensaje...";

function AccessGate({
  connected,
  authFailed,
  onSubmit,
}: {
  connected: boolean;
  authFailed: boolean;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const { token } = theme.useToken();

  return (
    <Flex align="center" justify="center" style={{ height: "100vh", background: token.colorBgLayout }}>
      <Card style={{ width: 360 }}>
        <Flex vertical gap="middle">
          <Flex align="center" gap="small">
            <LockOutlined style={{ fontSize: 20 }} />
            <Typography.Title level={4} style={{ margin: 0 }}>
              Acceso al chatbot
            </Typography.Title>
          </Flex>
          <Typography.Text type="secondary">
            Este chatbot usa una API paga. Ingresa el codigo de acceso para continuar.
          </Typography.Text>
          {authFailed && <Alert type="error" showIcon title="Codigo incorrecto" />}
          <Input.Password
            placeholder="Codigo de acceso"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onPressEnter={() => onSubmit(code)}
            disabled={!connected}
            autoFocus
          />
          <Button type="primary" block disabled={!connected || !code} onClick={() => onSubmit(code)}>
            Entrar
          </Button>
        </Flex>
      </Card>
    </Flex>
  );
}

export default function App() {
  const {
    connected,
    servers,
    toolsSummary,
    items,
    waitingForReply,
    sendUserMessage,
    classmatesEnabled,
    togglingClassmates,
    toggleClassmates,
    authRequired,
    authenticated,
    authFailed,
    submitAccessCode,
  } = useChatSocket();
  const [inputValue, setInputValue] = useState("");
  const { token } = theme.useToken();

  if (authRequired && !authenticated) {
    return <AccessGate connected={connected} authFailed={authFailed} onSubmit={submitAccessCode} />;
  }

  const connectedNames = new Set(servers.filter((s) => s.ok).map((s) => s.name));
  const example = EXAMPLE_PROMPTS.find((hint) => connectedNames.has(hint.server));
  const placeholder = example ? `Escribe tu mensaje... (ej. "${example.example}")` : DEFAULT_PLACEHOLDER;

  function handleSubmit(text: string) {
    sendUserMessage(text);
    setInputValue("");
  }

  return (
    <Layout style={{ height: "100vh" }}>
      <Header
        style={{
          height: "auto",
          lineHeight: "normal",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 24px",
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Title level={4} style={{ margin: 0, whiteSpace: "nowrap" }}>
            CC3067 Proyecto 1 - Chatbot MCP
          </Title>
          <Badge status={connected ? "success" : "error"} text={connected ? "Conectado" : "Desconectado"} />
          {toolsSummary && <Text type="secondary">{toolsSummary.total} herramientas MCP</Text>}
          <Space style={{ marginLeft: "auto" }}>
            <Text type="secondary">Servidores de compañeros</Text>
            <Switch
              checked={classmatesEnabled}
              loading={togglingClassmates}
              onChange={toggleClassmates}
              disabled={!connected}
            />
          </Space>
        </div>
        <Space wrap size={[8, 4]}>
          {servers.map((server) => (
            <Tag
              key={server.name}
              icon={server.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
              color={server.ok ? "success" : "error"}
            >
              {server.name}
            </Tag>
          ))}
        </Space>
      </Header>

      <Content style={{ overflow: "auto", padding: "16px 24px" }}>
        <Bubble.List autoScroll role={roles} items={items} style={{ maxWidth: 900, margin: "0 auto" }} />
      </Content>

      <Footer style={{ background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Sender
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          loading={waitingForReply}
          disabled={!connected}
          placeholder={placeholder}
          style={{ maxWidth: 900, margin: "0 auto" }}
        />
      </Footer>
    </Layout>
  );
}
