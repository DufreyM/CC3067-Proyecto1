import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa tu archivo .env (ver .env.example).`);
  }
  return value;
}

export const config = {
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
  maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 1024),
  logDir: process.env.LOG_DIR ?? "logs",
};
