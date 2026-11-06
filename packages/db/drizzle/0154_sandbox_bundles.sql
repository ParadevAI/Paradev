CREATE TABLE "sandbox_bundles" (
	"sha" text PRIMARY KEY NOT NULL,
	"image_ref" text NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL
);
