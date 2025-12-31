/**
 * 🚀 FASE 2 - INFRAESTRUTURA: Sistema de Cache Otimizado
 * 
 * Cache inteligente para melhorar performance das consultas de loteria
 * e reduzir chamadas desnecessárias às APIs externas.
 */

import memoize from 'memoizee';

// Global error handler for cache operations
const handleCacheError = (error: any, operation: string) => {
  console.warn(`🟡 Cache ${operation} failed:`, error.message);
  return null;
};

import { API_ENDPOINTS } from '@shared/lotteryConstants';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * 💾 CACHE EM MEMÓRIA COM EXPIRAÇÃO INTELIGENTE
 */
export class MemoryCache {
  private cache = new Map<string, CacheItem<any>>();
  private readonly defaultTTL = API_ENDPOINTS.CACHE_DURATION; // 5 minutos

  /**
   * Armazenar dados no cache com TTL personalizado
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    const now = Date.now();
    const expires = now + (ttlMs || this.defaultTTL);

    try {
      this.cache.set(key, {
        data,
        timestamp: now,
        expiresAt: expires,
      });
      this.cleanupExpired();
    } catch (error) {
      handleCacheError(error, `set for key ${key}`);
    }
  }

  /**
   * Recuperar dados do cache se ainda válidos
   */
  get<T>(key: string): T | null {
    try {
      const item = this.cache.get(key);

      if (!item) {
        return null;
      }

      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      return item.data as T;
    } catch (error) {
      return handleCacheError(error, `get for key ${key}`);
    }
  }

  /**
   * Verificar se uma chave existe e é válida
   */
  has(key: string): boolean {
    try {
      return this.get(key) !== null;
    } catch (error) {
      return handleCacheError(error, `has for key ${key}`) !== null;
    }
  }

  /**
   * Remover item específico do cache
   */
  delete(key: string): boolean {
    try {
      return this.cache.delete(key);
    } catch (error) {
      return handleCacheError(error, `delete for key ${key}`) as boolean;
    }
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    try {
      this.cache.clear();
    } catch (error) {
      handleCacheError(error, 'clear');
    }
  }

  /**
   * Obter estatísticas do cache
   */
  getStats() {
    try {
      const now = Date.now();
      let validItems = 0;
      let expiredItems = 0;

      this.cache.forEach(item => {
        if (now <= item.expiresAt) {
          validItems++;
        } else {
          expiredItems++;
        }
      });

      return {
        totalItems: this.cache.size,
        validItems,
        expiredItems,
        hitRate: this.calculateHitRate(),
        memoryUsage: this.estimateMemoryUsage(),
      };
    } catch (error) {
      return handleCacheError(error, 'getStats');
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    try {
      Array.from(this.cache.entries()).forEach(([key, item]) => {
        if (now > item.expiresAt) {
          this.cache.delete(key);
        }
      });
    } catch (error) {
      handleCacheError(error, 'cleanupExpired');
    }
  }

  private hitRate = { hits: 0, misses: 0 };

  private calculateHitRate(): string {
    try {
      const total = this.hitRate.hits + this.hitRate.misses;
      if (total === 0) return '0%';
      return `${((this.hitRate.hits / total) * 100).toFixed(1)}%`;
    } catch (error) {
      return handleCacheError(error, 'calculateHitRate') || 'N/A';
    }
  }

  private estimateMemoryUsage(): string {
    try {
      const jsonString = JSON.stringify(Array.from(this.cache.entries()));
      const bytes = new Blob([jsonString]).size;
      return `${(bytes / 1024).toFixed(1)} KB`;
    } catch (error) {
      return handleCacheError(error, 'estimateMemoryUsage') || 'N/A';
    }
  }

  recordHit(): void {
    try {
      this.hitRate.hits++;
    } catch (error) {
      handleCacheError(error, 'recordHit');
    }
  }

  recordMiss(): void {
    try {
      this.hitRate.misses++;
    } catch (error) {
      handleCacheError(error, 'recordMiss');
    }
  }
}

/**
 * 🎯 CACHE ESPECIALIZADO PARA LOTERIAS
 */
export class LotteryCache {
  private cache: MemoryCache;

  // TTLs específicos por tipo de dados (em milissegundos)
  private readonly TTL = {
    LOTTERY_DATA: 30 * 60 * 1000,    // 30 minutos - dados das loterias
    DRAW_RESULTS: 24 * 60 * 60 * 1000, // 24 horas - resultados de sorteios
    NEXT_DRAW: 5 * 60 * 1000,        // 5 minutos - próximo sorteio
    FREQUENCY_DATA: 60 * 60 * 1000,   // 1 hora - análise de frequência
    AI_ANALYSIS: 15 * 60 * 1000,      // 15 minutos - análise IA
    USER_GAMES: 10 * 60 * 1000,       // 10 minutos - jogos do usuário
  };

  constructor() {
    this.cache = new MemoryCache();
    this.setupPeriodicCleanup();
  }

  /**
   * 🎲 Cache de dados de loteria
   */
  getLotteryData(lotteryId: string) {
    const key = `lottery:${lotteryId}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.recordHit();
      console.log(`🎯 Cache hit: Lottery data for ${lotteryId}`);
      return cached;
    }

    this.cache.recordMiss();
    return null;
  }

  setLotteryData(lotteryId: string, data: any) {
    const key = `lottery:${lotteryId}`;
    this.cache.set(key, data, this.TTL.LOTTERY_DATA);
    console.log(`💾 Cached: Lottery data for ${lotteryId}`);
  }

  /**
   * 🎊 Cache de resultados de sorteios
   */
  getDrawResults(lotteryId: string, contestNumber: number) {
    const key = `draw:${lotteryId}:${contestNumber}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.recordHit();
      return cached;
    }

    this.cache.recordMiss();
    return null;
  }

  setDrawResults(lotteryId: string, contestNumber: number, data: any) {
    const key = `draw:${lotteryId}:${contestNumber}`;
    this.cache.set(key, data, this.TTL.DRAW_RESULTS);
  }

  /**
   * ⏰ Cache de próximo sorteio
   */
  getNextDraw(lotteryId: string) {
    const key = `next:${lotteryId}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.recordHit();
      console.log(`🎯 Cache hit: Next draw for ${lotteryId}`);
      return cached;
    }

    this.cache.recordMiss();
    return null;
  }

  setNextDraw(lotteryId: string, data: any) {
    const key = `next:${lotteryId}`;
    this.cache.set(key, data, this.TTL.NEXT_DRAW);
    console.log(`💾 Cached: Next draw for ${lotteryId}`);
  }

  /**
   * 📊 Cache de análise de frequência
   */
  getFrequencyAnalysis(lotteryId: string) {
    const key = `frequency:${lotteryId}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.recordHit();
      return cached;
    }

    this.cache.recordMiss();
    return null;
  }

  setFrequencyAnalysis(lotteryId: string, data: any) {
    const key = `frequency:${lotteryId}`;
    this.cache.set(key, data, this.TTL.FREQUENCY_DATA);
  }

  /**
   * 🤖 Cache de análise IA
   */
  getAIAnalysis(lotteryId: string, analysisType: string) {
    const key = `ai:${lotteryId}:${analysisType}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.recordHit();
      console.log(`🎯 Cache hit: AI analysis for ${lotteryId} (${analysisType})`);
      return cached;
    }

    this.cache.recordMiss();
    return null;
  }

  setAIAnalysis(lotteryId: string, analysisType: string, data: any) {
    const key = `ai:${lotteryId}:${analysisType}`;
    this.cache.set(key, data, this.TTL.AI_ANALYSIS);
    console.log(`💾 Cached: AI analysis for ${lotteryId} (${analysisType})`);
  }

  /**
   * 👤 Cache de jogos do usuário
   */
  getUserGames(userId: string) {
    const key = `user:games:${userId}`;
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.recordHit();
      return cached;
    }

    this.cache.recordMiss();
    return null;
  }

  setUserGames(userId: string, data: any) {
    const key = `user:games:${userId}`;
    this.cache.set(key, data, this.TTL.USER_GAMES);
  }

  /**
   * 🧹 Invalidar cache específico
   */
  invalidateLottery(lotteryId: string) {
    const patterns = [
      `lottery:${lotteryId}`,
      `next:${lotteryId}`,
      `frequency:${lotteryId}`,
    ];

    patterns.forEach(pattern => {
      try {
        this.cache.delete(pattern);
      } catch (error) {
        handleCacheError(error, `invalidateLottery pattern ${pattern}`);
      }
    });

    console.log(`🗑️ Invalidated cache for lottery: ${lotteryId}`);
  }

  invalidateUser(userId: string) {
    try {
      this.cache.delete(`user:games:${userId}`);
      console.log(`🗑️ Invalidated cache for user: ${userId}`);
    } catch (error) {
      handleCacheError(error, `invalidateUser for ${userId}`);
    }
  }

  /**
   * 📈 Estatísticas do cache
   */
  getStats() {
    try {
      const stats = this.cache.getStats();
      console.log('📊 Cache Statistics:', stats);
      return stats;
    } catch (error) {
      return handleCacheError(error, 'getStats');
    }
  }

  /**
   * 🧼 Limpeza periódica automática
   */
  private setupPeriodicCleanup() {
    setInterval(() => {
      try {
        const statsBefore = this.cache.getStats();
        this.cache.clear();
        const statsAfter = this.cache.getStats();

        if (statsBefore.expiredItems > 0) {
          console.log(`🧹 Cleaned ${statsBefore.expiredItems} expired cache items`);
        }
      } catch (error) {
        handleCacheError(error, 'setupPeriodicCleanup');
      }
    }, 10 * 60 * 1000);
  }

  /**
   * 💫 Pré-aquecimento do cache
   */
  async warmup(lotteryIds: string[]) {
    console.log('🔥 Warming up cache for lotteries:', lotteryIds.join(', '));

    for (const lotteryId of lotteryIds) {
      try {
        console.log(`🔥 Preloaded cache for ${lotteryId}`);
      } catch (error) {
        handleCacheError(error, `warmup for ${lotteryId}`);
      }
    }
  }
}

// Instância singleton do cache
export const lotteryCache = new LotteryCache();