// The marketing env validates every deploy variable at import; tests set none.
process.env.SKIP_ENV_VALIDATION ??= "1";
process.env.NEXT_PUBLIC_WEB_URL ??= "https://app.example.test";
