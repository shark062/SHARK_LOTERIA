import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date, doublePrecision } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// === TABLE DEFINITIONS ===

// Store official lottery results
export const lotteryGames = pgTable("lottery_games", {
  id: serial("id").primaryKey(),
  gameType: text("game_type").notNull(), // 'mega-sena', 'lotofacil', 'quina', etc.
  contestNumber: integer("contest_number").notNull(),
  date: date("date").notNull(),
  numbers: integer("numbers").array().notNull(), // The drawn numbers
  prizeEstimate: doublePrecision("prize_estimate").default(0),
  nextPrizeEstimate: doublePrecision("next_prize_estimate").default(0),
  winnersCount: integer("winners_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Store user generated games
export const generatedGames = pgTable("generated_games", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  gameType: text("game_type").notNull(),
  numbers: integer("numbers").array().notNull(),
  status: text("status").default("pending"), // 'pending', 'checked', 'won', 'lost'
  hits: integer("hits").default(0), // Number of hits if checked against a result
  contestNumber: integer("contest_number"), // The contest this game is for
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===
export const generatedGamesRelations = relations(generatedGames, ({ one }) => ({
  user: one(users, {
    fields: [generatedGames.userId],
    references: [users.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertLotteryGameSchema = createInsertSchema(lotteryGames).omit({ id: true, createdAt: true });
export const insertGeneratedGameSchema = createInsertSchema(generatedGames).omit({ id: true, createdAt: true, status: true, hits: true });

// === EXPLICIT API CONTRACT TYPES ===

// Base types
export type LotteryGame = typeof lotteryGames.$inferSelect;
export type InsertLotteryGame = z.infer<typeof insertLotteryGameSchema>;

export type GeneratedGame = typeof generatedGames.$inferSelect;
export type InsertGeneratedGame = z.infer<typeof insertGeneratedGameSchema>;

// Request types
export type CreateGeneratedGameRequest = InsertGeneratedGame;
export type GenerateNumbersRequest = {
  gameType: string;
  quantity: number; // 0-60 (actually usually 6-15 depending on game, but user asked for 0-60)
  amountOfGames: number;
  strategy: "hot" | "cold" | "mixed" | "random";
};

// Response types
export type GameStatsResponse = {
  hotNumbers: number[];
  coldNumbers: number[];
  rareNumbers: number[]; // "numeros raros que quase nao saem" - similar to cold but maybe stricter?
  frequencyMap: Record<number, number>; // For heatmap
};

export type AnalysisResponse = {
  recommendation: string; // AI generated text
  stats: GameStatsResponse;
};

export * from "./models/auth";
export * from "./models/chat";
