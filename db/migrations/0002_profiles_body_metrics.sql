CREATE TABLE "body_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"weight_kg" numeric(5, 1),
	"body_fat_pct" numeric(4, 1),
	"waist_cm" numeric(5, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_metrics_user_measured_on_unique" UNIQUE("user_id","measured_on")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sex" text NOT NULL,
	"birth_year" integer NOT NULL,
	"height_cm" numeric(5, 1) NOT NULL,
	"activity_level" text NOT NULL,
	"goal" text NOT NULL,
	"target_kcal" integer NOT NULL,
	"target_protein_g" integer NOT NULL,
	"target_carb_g" integer NOT NULL,
	"target_fat_g" integer NOT NULL,
	"targets_overridden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_sex_check" CHECK ("user_profiles"."sex" in ('male', 'female')),
	CONSTRAINT "user_profiles_activity_level_check" CHECK ("user_profiles"."activity_level" in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "user_profiles_goal_check" CHECK ("user_profiles"."goal" in ('cut', 'maintain', 'bulk'))
);
--> statement-breakpoint
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;