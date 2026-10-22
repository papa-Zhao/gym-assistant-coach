CREATE TABLE "ai_usage_anonymous_daily" (
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_anonymous_daily_day_kind_pk" PRIMARY KEY("day","kind"),
	CONSTRAINT "ai_usage_anonymous_daily_kind_check" CHECK ("ai_usage_anonymous_daily"."kind" in ('photo', 'text', 'chat'))
);
