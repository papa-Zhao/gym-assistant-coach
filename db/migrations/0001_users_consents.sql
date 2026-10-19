CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"doc" text NOT NULL,
	"version" text NOT NULL,
	"agreed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_user_doc_version_unique" UNIQUE("user_id","doc","version"),
	CONSTRAINT "consents_doc_check" CHECK ("doc" in ('terms', 'privacy', 'age_18_plus'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_user_id" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_line_user_id_unique" UNIQUE("line_user_id"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'coach', 'admin')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'unfollowed', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;