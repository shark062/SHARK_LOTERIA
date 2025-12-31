import { db } from "./db";
import {
  lotteryGames,
  generatedGames,
  type InsertLotteryGame,
  type InsertGeneratedGame,
  type LotteryGame,
  type GeneratedGame,
  type GenerateNumbersRequest,
  type AnalysisResponse
} from "@shared/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Lottery Games
  getLotteryGames(type?: string, limit?: number): Promise<LotteryGame[]>;
  getLatestLotteryGame(type: string): Promise<LotteryGame | undefined>;
  createLotteryGame(game: InsertLotteryGame): Promise<LotteryGame>;
  
  // Analysis
  getGameStats(type: string): Promise<AnalysisResponse["stats"]>;
  
  // User Games
  getUserGames(userId: string): Promise<GeneratedGame[]>;
  createGeneratedGame(game: InsertGeneratedGame): Promise<GeneratedGame>;
  checkUserGames(userId: string): Promise<number>; // Returns updated count
}

export class DatabaseStorage implements IStorage {
  async getLotteryGames(type?: string, limit = 20): Promise<LotteryGame[]> {
    const query = db.select().from(lotteryGames);
    if (type) {
      query.where(eq(lotteryGames.gameType, type));
    }
    return await query.orderBy(desc(lotteryGames.date)).limit(limit);
  }

  async getLatestLotteryGame(type: string): Promise<LotteryGame | undefined> {
    const [game] = await db.select()
      .from(lotteryGames)
      .where(eq(lotteryGames.gameType, type))
      .orderBy(desc(lotteryGames.date))
      .limit(1);
    return game;
  }

  async createLotteryGame(game: InsertLotteryGame): Promise<LotteryGame> {
    const [newGame] = await db.insert(lotteryGames).values(game).returning();
    return newGame;
  }

  async getGameStats(type: string): Promise<AnalysisResponse["stats"]> {
    // Get last 20 games for analysis as requested
    const games = await this.getLotteryGames(type, 20);
    const frequencyMap: Record<number, number> = {};
    
    games.forEach(game => {
      game.numbers.forEach(num => {
        frequencyMap[num] = (frequencyMap[num] || 0) + 1;
      });
    });

    // Sort by frequency
    const sortedNumbers = Object.entries(frequencyMap)
      .sort(([, a], [, b]) => b - a)
      .map(([num]) => parseInt(num));

    return {
      hotNumbers: sortedNumbers.slice(0, 5),
      coldNumbers: sortedNumbers.slice(-5).reverse(),
      rareNumbers: sortedNumbers.filter(n => !frequencyMap[n] || frequencyMap[n] <= 1), // Very rare in last 20
      frequencyMap
    };
  }

  async getUserGames(userId: string): Promise<GeneratedGame[]> {
    return await db.select()
      .from(generatedGames)
      .where(eq(generatedGames.userId, userId))
      .orderBy(desc(generatedGames.createdAt));
  }

  async createGeneratedGame(game: InsertGeneratedGame): Promise<GeneratedGame> {
    const [newGame] = await db.insert(generatedGames).values(game).returning();
    return newGame;
  }

  async checkUserGames(userId: string): Promise<number> {
    // Naive implementation: Check pending games against latest results
    // In real app, this would be more robust matching specific contest numbers
    const pendingGames = await db.select()
      .from(generatedGames)
      .where(
        sql`${generatedGames.userId} = ${userId} AND ${generatedGames.status} = 'pending'`
      );

    let updatedCount = 0;

    for (const game of pendingGames) {
      // Find the result for this game's type and contest (if set) or just latest
      const result = await this.getLatestLotteryGame(game.gameType);
      
      if (result) {
        // Calculate hits
        const hits = game.numbers.filter(n => result.numbers.includes(n)).length;
        
        // Update status
        // Win condition simplified: > 3 hits for example purposes
        const status = hits > 3 ? 'won' : 'lost'; 
        
        await db.update(generatedGames)
          .set({ status, hits })
          .where(eq(generatedGames.id, game.id));
        updatedCount++;
      }
    }

    return updatedCount;
  }
}

export const storage = new DatabaseStorage();
