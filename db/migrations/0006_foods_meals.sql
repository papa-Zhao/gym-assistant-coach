CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"name" text NOT NULL,
	"aliases" text,
	"category" text,
	"kcal_per_100g" numeric(6, 1) NOT NULL,
	"protein_per_100g" numeric(6, 1),
	"carb_per_100g" numeric(6, 1),
	"fat_per_100g" numeric(6, 1),
	"serving_desc" text,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_source_source_ref_unique" UNIQUE("source","source_ref"),
	CONSTRAINT "foods_source_check" CHECK ("foods"."source" in ('tfda', 'custom', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"food_id" uuid,
	"name" text NOT NULL,
	"grams" numeric(6, 1) NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" numeric(6, 1) NOT NULL,
	"carb_g" numeric(6, 1) NOT NULL,
	"fat_g" numeric(6, 1) NOT NULL,
	"ai_confidence" numeric(3, 2),
	CONSTRAINT "meal_items_meal_position_unique" UNIQUE("meal_id","position")
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"eaten_on" date NOT NULL,
	"meal_type" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "meals_meal_type_check" CHECK ("meals"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack')),
	CONSTRAINT "meals_status_check" CHECK ("meals"."status" in ('draft', 'confirmed')),
	CONSTRAINT "meals_source_check" CHECK ("meals"."source" in ('photo', 'text', 'manual', 'copy'))
);
--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meals_user_eaten_on_idx" ON "meals" USING btree ("user_id","eaten_on");