import "../../../scripts/test-preload.ts";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.BILLING_PROVIDER = "stripe";
// Importing a module that constructs a client throws without these. None
// connects until it is used.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
process.env.AUTUMN_SECRET_KEY ??= "am_sk_test_placeholder";
process.env.RESEND_API_KEY ??= "re_placeholder";
process.env.NEXT_PUBLIC_MARKETING_URL ??= "https://superset.test";
process.env.NEXT_PUBLIC_POSTHOG_KEY ??= "phc_placeholder";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;
