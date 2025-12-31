
/**
 * 🧪 BACKTESTING AVANÇADO E ANÁLISE DE RISCO-RETORNO
 */

interface BacktestResult {
  strategy: string;
  period: { start: Date; end: Date };
  totalTests: number;
  successRate: number;
  avgAccuracy: number;
  riskMetrics: {
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
  };
  expectedValue: number;
  confidence: number;
}

export class AdvancedBacktestingService {
  
  /**
   * Executar backtesting completo de uma estratégia
   */
  async runAdvancedBacktest(
    strategyName: string,
    strategyFunction: (data: any[]) => number[],
    historicalData: any[],
    config: any
  ): Promise<BacktestResult> {
    console.log(`🔬 Iniciando backtesting avançado: ${strategyName}`);

    const results: Array<{
      predicted: number[];
      actual: number[];
      matches: number;
      profit: number;
    }> = [];

    let cumulativeProfit = 0;
    let maxDrawdown = 0;
    let peakProfit = 0;

    // Janela deslizante para simular predições
    for (let i = 50; i < historicalData.length - 1; i++) {
      const trainingData = historicalData.slice(i - 50, i);
      const targetDraw = historicalData[i];

      if (!targetDraw.drawnNumbers) continue;

      const predicted = strategyFunction(trainingData);
      const actual = targetDraw.drawnNumbers;
      const matches = predicted.filter(n => actual.includes(n)).length;

      // Calcular lucro simulado
      const betCost = 5; // R$ 5 por aposta
      const profit = this.calculateProfit(matches) - betCost;
      
      cumulativeProfit += profit;
      
      // Atualizar drawdown
      if (cumulativeProfit > peakProfit) {
        peakProfit = cumulativeProfit;
      }
      const currentDrawdown = peakProfit - cumulativeProfit;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }

      results.push({ predicted, actual, matches, profit });
    }

    // Calcular métricas
    const successRate = results.filter(r => r.matches >= 3).length / results.length;
    const avgAccuracy = results.reduce((sum, r) => sum + (r.matches / config.minNumbers), 0) / results.length;
    
    const wins = results.filter(r => r.profit > 0);
    const losses = results.filter(r => r.profit < 0);
    
    const avgWin = wins.length > 0 ? wins.reduce((sum, r) => sum + r.profit, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, r) => sum + r.profit, 0) / losses.length) : 1;
    
    const sharpeRatio = this.calculateSharpeRatio(results.map(r => r.profit));
    const winRate = wins.length / results.length;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    const expectedValue = cumulativeProfit / results.length;

    return {
      strategy: strategyName,
      period: {
        start: new Date(historicalData[50].drawDate),
        end: new Date(historicalData[historicalData.length - 1].drawDate)
      },
      totalTests: results.length,
      successRate,
      avgAccuracy,
      riskMetrics: {
        sharpeRatio,
        maxDrawdown,
        winRate,
        profitFactor
      },
      expectedValue,
      confidence: this.calculateConfidence(successRate, results.length)
    };
  }

  /**
   * Comparar múltiplas estratégias
   */
  async compareStrategies(
    strategies: Array<{ name: string; function: (data: any[]) => number[] }>,
    historicalData: any[],
    config: any
  ): Promise<{
    bestStrategy: string;
    results: BacktestResult[];
    recommendation: string;
  }> {
    const results: BacktestResult[] = [];

    for (const strategy of strategies) {
      const result = await this.runAdvancedBacktest(
        strategy.name,
        strategy.function,
        historicalData,
        config
      );
      results.push(result);
    }

    // Ordenar por valor esperado ajustado por risco
    const ranked = results.sort((a, b) => {
      const scoreA = a.expectedValue * a.riskMetrics.sharpeRatio;
      const scoreB = b.expectedValue * b.riskMetrics.sharpeRatio;
      return scoreB - scoreA;
    });

    const best = ranked[0];
    
    return {
      bestStrategy: best.strategy,
      results: ranked,
      recommendation: this.generateRecommendation(best)
    };
  }

  /**
   * Análise de janelas temporais
   */
  analyzeTimeWindows(
    strategy: (data: any[]) => number[],
    historicalData: any[],
    windows: number[] = [10, 30, 50, 100]
  ): Map<number, { accuracy: number; consistency: number }> {
    const windowResults = new Map<number, { accuracy: number; consistency: number }>();

    windows.forEach(windowSize => {
      const accuracies: number[] = [];

      for (let i = windowSize; i < historicalData.length - 1; i++) {
        const data = historicalData.slice(i - windowSize, i);
        const target = historicalData[i];

        if (!target.drawnNumbers) continue;

        const predicted = strategy(data);
        const matches = predicted.filter(n => target.drawnNumbers.includes(n)).length;
        accuracies.push(matches / predicted.length);
      }

      const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
      const consistency = this.calculateConsistency(accuracies);

      windowResults.set(windowSize, { accuracy: avgAccuracy, consistency });
    });

    return windowResults;
  }

  private calculateProfit(matches: number): number {
    const prizeTable: Record<number, number> = {
      6: 50000000,
      5: 50000,
      4: 1000,
      3: 50,
      2: 10
    };
    return prizeTable[matches] || 0;
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  private calculateConfidence(successRate: number, sampleSize: number): number {
    // Intervalo de confiança baseado no tamanho da amostra
    const z = 1.96; // 95% confiança
    const margin = z * Math.sqrt((successRate * (1 - successRate)) / sampleSize);
    return 1 - margin;
  }

  private calculateConsistency(values: number[]): number {
    if (values.length === 0) return 0;
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    
    return 1 / (1 + Math.sqrt(variance));
  }

  private generateRecommendation(result: BacktestResult): string {
    if (result.expectedValue > 0 && result.riskMetrics.sharpeRatio > 1) {
      return `Estratégia ${result.strategy} demonstra excelente desempenho com Sharpe Ratio de ${result.riskMetrics.sharpeRatio.toFixed(2)} e valor esperado positivo de R$ ${result.expectedValue.toFixed(2)} por aposta. RECOMENDADA.`;
    } else if (result.successRate > 0.3) {
      return `Estratégia ${result.strategy} tem performance moderada com ${(result.successRate * 100).toFixed(1)}% de taxa de sucesso. Considere combinar com outras estratégias.`;
    } else {
      return `Estratégia ${result.strategy} não demonstra vantagem estatística significativa. NÃO RECOMENDADA.`;
    }
  }
}

export const advancedBacktesting = new AdvancedBacktestingService();
