import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lt,
  notExists,
  sql,
} from "drizzle-orm";
import { aiConversations, aiMessages } from "../db/schema";
import type { Db } from "../users/repo";

export const ASK_HISTORY_MESSAGES = 10;
export const ASK_RETENTION_DAYS = 90;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const DAY_MS = 86_400_000;

const retentionCutoff = (now: Date) =>
  new Date(now.getTime() - ASK_RETENTION_DAYS * DAY_MS);

const activeConversation = (userId: string) =>
  and(eq(aiConversations.userId, userId), isNull(aiConversations.endedAt));

/** Current conversation's last 10 messages within retention, oldest first. */
export async function recentTurns(
  db: Db,
  userId: string,
  now: Date,
): Promise<ChatTurn[]> {
  const rows = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .innerJoin(
      aiConversations,
      eq(aiMessages.conversationId, aiConversations.id),
    )
    .where(
      and(
        activeConversation(userId),
        gte(aiMessages.createdAt, retentionCutoff(now)),
      ),
    )
    .orderBy(desc(aiMessages.createdAt), asc(aiMessages.role))
    .limit(ASK_HISTORY_MESSAGES);
  // Keep roles strictly alternating, starting with a user turn.
  const turns: ChatTurn[] = [];
  for (const r of rows.reverse()) {
    const role = r.role as ChatTurn["role"];
    const last = turns[turns.length - 1];
    if (last ? last.role === role : role !== "user") continue;
    turns.push({ role, content: r.content });
  }
  return turns;
}

/** Appends the question and the answer to the current conversation, creating it if needed; one transaction. */
export async function appendExchange(
  db: Db,
  userId: string,
  question: string,
  answer: string,
  usage: { input: number; output: number },
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const find = async () =>
      (
        await tx
          .select({ id: aiConversations.id })
          .from(aiConversations)
          .where(activeConversation(userId))
          .limit(1)
      )[0]?.id;
    let conversationId = await find();
    if (!conversationId) {
      // The partial unique index lets only one concurrent insert win.
      conversationId = (
        await tx
          .insert(aiConversations)
          .values({ userId, startedAt: now })
          .onConflictDoNothing()
          .returning({ id: aiConversations.id })
      )[0]?.id;
      conversationId ??= await find();
    }
    if (!conversationId) throw new Error("appendExchange: no conversation");
    await tx.insert(aiMessages).values([
      { conversationId, role: "user", content: question, createdAt: now },
      {
        conversationId,
        role: "assistant",
        content: answer,
        inputTokens: usage.input,
        outputTokens: usage.output,
        // After the question, so ordering by time keeps the pair in order.
        createdAt: new Date(now.getTime() + 1),
      },
    ]);
  });
}

/** Ends the current conversation; no-op when there is none. */
export async function endConversation(
  db: Db,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .update(aiConversations)
    .set({ endedAt: now })
    .where(activeConversation(userId));
}

/** Deletes all users' messages older than 90 days, then ended conversations left empty. */
export async function purgeExpiredMessages(db: Db, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(aiMessages)
      .where(lt(aiMessages.createdAt, retentionCutoff(now)));
    await tx.delete(aiConversations).where(
      and(
        sql`${aiConversations.endedAt} is not null`,
        notExists(
          tx
            .select({ one: sql`1` })
            .from(aiMessages)
            .where(eq(aiMessages.conversationId, aiConversations.id)),
        ),
      ),
    );
  });
}
