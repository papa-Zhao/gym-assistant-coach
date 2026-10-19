CREATE TABLE "cardio_entries" (
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"entry_index" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"distance_km" numeric(5, 2),
	"incline_pct" numeric(3, 1),
	"speed_kmh" numeric(3, 1),
	"level" integer,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cardio_entries_session_id_exercise_id_entry_index_pk" PRIMARY KEY("session_id","exercise_id","entry_index")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name_zh" text NOT NULL,
	"name_en" text,
	"kind" text NOT NULL,
	"muscle_group" text,
	"equipment" text NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"owner_user_id" uuid,
	"archived_at" timestamp with time zone,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug"),
	CONSTRAINT "exercises_kind_check" CHECK ("exercises"."kind" in ('strength', 'cardio')),
	CONSTRAINT "exercises_muscle_group_check" CHECK ("exercises"."muscle_group" in ('chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core')),
	CONSTRAINT "exercises_equipment_check" CHECK ("exercises"."equipment" in ('selectorized_machine', 'plate_loaded_machine', 'smith_machine', 'cable', 'barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'bodyweight', 'treadmill', 'stair_climber', 'stationary_bike', 'rower', 'elliptical', 'none')),
	CONSTRAINT "exercises_strength_muscle_check" CHECK ("exercises"."kind" = 'cardio' or "exercises"."muscle_group" is not null),
	CONSTRAINT "exercises_custom_owner_check" CHECK ("exercises"."is_custom" = ("exercises"."owner_user_id" is not null)),
	CONSTRAINT "exercises_builtin_names_check" CHECK ("exercises"."is_custom" or ("exercises"."slug" is not null and "exercises"."name_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "template_items" (
	"template_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"sets" integer NOT NULL,
	"reps" integer NOT NULL,
	CONSTRAINT "template_items_template_id_exercise_id_pk" PRIMARY KEY("template_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "workout_session_items" (
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"target_sets" integer,
	"target_reps" integer,
	CONSTRAINT "workout_session_items_session_id_exercise_id_pk" PRIMARY KEY("session_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"performed_on" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"note" text,
	"template_id" uuid,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight_kg" numeric(5, 1) NOT NULL,
	"rpe" numeric(3, 1),
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sets_session_id_exercise_id_set_index_pk" PRIMARY KEY("session_id","exercise_id","set_index")
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD CONSTRAINT "cardio_entries_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardio_entries" ADD CONSTRAINT "cardio_entries_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_items" ADD CONSTRAINT "workout_session_items_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_items" ADD CONSTRAINT "workout_session_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_builtin_name_zh_unique" ON "exercises" USING btree ("name_zh") WHERE not "exercises"."is_custom";--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_active_unique" ON "workout_sessions" USING btree ("user_id") WHERE "workout_sessions"."ended_at" is null;