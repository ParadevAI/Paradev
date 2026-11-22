import "../../../scripts/test-preload.ts";

// client.ts builds its clients on import; neither connects until a query runs.
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ||= process.env.DATABASE_URL;
