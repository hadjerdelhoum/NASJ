import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", isProd ? undefined : "postgres://nasj:nasj@localhost:5432/nasj"),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-only-secret-change-me"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  isProd,
};
