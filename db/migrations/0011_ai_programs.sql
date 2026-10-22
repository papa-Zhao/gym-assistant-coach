CREATE TABLE "ai_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"days" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "source_program_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD COLUMN "source_day" integer;--> statement-breakpoint
ALTER TABLE "ai_programs" ADD CONSTRAINT "ai_programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_programs_created_idx" ON "ai_programs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_source_program_id_ai_programs_id_fk" FOREIGN KEY ("source_program_id") REFERENCES "public"."ai_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_templates_program_day_unique" ON "workout_templates" USING btree ("source_program_id","source_day") WHERE "workout_templates"."source_program_id" is not null;