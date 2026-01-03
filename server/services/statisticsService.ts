import { storage } from "../storage";
import { eq, sql, desc, and } from "drizzle-orm";
import * as schema from "@shared/schema";

export class StatisticsService {
  private static instance: StatisticsService;
  
  private constructor() {}

  public static getInstance(): StatisticsService {
    if (!StatisticsService.instance) {
      StatisticsService.instance = new StatisticsService();
    }
    return StatisticsService.instance;
  }

  /**
   * Calcula a assertividade histórica de uma estratégia específica
   */
  public async getStrategyPerformance(lotteryId: string, strategy: string) {
    try {
      const stats = await storage.getUserStats('guest-user');
      const games = await storage.getUserGames('guest-user', 100);
      
      const strategyGames = games.filter(g => g.lotteryId === lotteryId && g.strategy === strategy);
      const total = strategyGames.length;
      if (total === 0) return { accuracy: 0, total: 0 };

      const wins = strategyGames.filter(g => (g.matches || 0) >= 3).length; // Considera acerto acima de 3
      return {
        accuracy: (wins / total) * 100,
        total,
        avgMatches: strategyGames.reduce((acc, g) => acc + (g.matches || 0), 0) / total
      };
    } catch (error) {
      console.error('Erro ao calcular performance da estratégia:', error);
      return { accuracy: 0, total: 0 };
    }
  }

  /**
   * Analisa tendências de números quentes e frios com base no histórico recente
   */
  public async analyzeNumberTrends(lotteryId: string, limit = 50) {
    const draws = await storage.getLatestDraws(lotteryId, limit);
    const frequencyMap: Record<number, number> = {};
    
    draws.forEach(draw => {
      draw.drawnNumbers?.forEach(num => {
        frequencyMap[num] = (frequencyMap[num] || 0) + 1;
      });
    });

    return Object.entries(frequencyMap)
      .map(([num, freq]) => ({ number: parseInt(num), frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency);
  }
}

export const statisticsService = StatisticsService.getInstance();
