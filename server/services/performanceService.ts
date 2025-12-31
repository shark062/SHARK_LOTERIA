/**
 * 📊 SISTEMA DE MÉTRICAS DE PERFORMANCE
 * 
 * Gerencia avaliação contínua de predições, backtesting e comparação de estratégias
 * para melhorar constantemente a precisão dos modelos de IA.
 */

import { storage } from '../storage';
import type { 
  LotteryDraw, 
  Prediction, 
  InsertPrediction, 
  ModelPerformance,
  InsertBacktestResult 
} from '@shared/schema';

interface PredictionMetadata {
  temperature: string;
  algorithm: string;
  parameters: Record<string, any>;
  dataQuality: number;
  confidence_factors: string[];
}

interface BacktestMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  consistency: number;
  profitability: number;
}

export class PerformanceService {
  private readonly ACCURACY_THRESHOLD = 0.33; // 33% é considerado sucesso (1/3 dos números)
  private readonly CONFIDENCE_THRESHOLD = 0.25;

  /**
   * 💾 Registrar predição para avaliação posterior
   */
  async recordPrediction(
    lotteryId: string,
    contestNumber: number,
    modelName: string,
    strategy: string,
    predictedNumbers: number[],
    confidence: number,
    metadata: PredictionMetadata
  ): Promise<void> {
    try {
      const prediction: InsertPrediction = {
        lotteryId,
        contestNumber,
        modelName,
        strategy,
        predictedNumbers,
        confidence: confidence.toString(),
        metadata,
        isEvaluated: false
      };

      await storage.savePrediction(prediction);
      console.log(`📝 Predição registrada: ${modelName}/${strategy} para ${lotteryId} #${contestNumber}`);
    } catch (error) {
      console.error('Erro ao registrar predição:', error);
    }
  }

  /**
   * 🎯 Avaliar predições quando sai resultado oficial
   */
  async evaluatePredictions(lotteryId: string, contestNumber: number, actualNumbers: number[]): Promise<void> {
    try {
      const unevaluatedPredictions = await storage.getUnevaluatedPredictions(lotteryId, contestNumber);
      
      console.log(`🔍 Avaliando ${unevaluatedPredictions.length} predições para ${lotteryId} #${contestNumber}`);
      
      for (const prediction of unevaluatedPredictions) {
        const matches = this.calculateMatches(prediction.predictedNumbers, actualNumbers);
        const accuracy = this.calculateAccuracy(matches, prediction.predictedNumbers.length, actualNumbers.length);
        const confidence = parseFloat(prediction.confidence?.toString() || '0');

        // Atualizar predição com resultado
        await storage.evaluatePrediction(prediction.id, actualNumbers, matches, accuracy);

        // Atualizar performance do modelo
        await storage.updateModelPerformance(
          prediction.modelName,
          lotteryId,
          accuracy,
          confidence
        );

        console.log(`✅ ${prediction.modelName}: ${matches} acertos (${(accuracy * 100).toFixed(1)}%)`);
      }

      console.log(`📊 Avaliação completa para ${lotteryId} #${contestNumber}`);
    } catch (error) {
      console.error('Erro ao avaliar predições:', error);
    }
  }

  /**
   * 🧪 Executar backtesting em dados históricos
   */
  async runBacktest(
    testName: string,
    modelName: string,
    strategy: string,
    lotteryId: string,
    historicalDraws: LotteryDraw[],
    testParameters: Record<string, any>
  ): Promise<BacktestMetrics> {
    try {
      console.log(`🔬 Iniciando backtesting: ${testName} (${historicalDraws.length} sorteios)`);
      
      const results: Array<{ predicted: number[], actual: number[], matches: number }> = [];
      let totalMatches = 0;
      let totalPredictions = 0;
      let accuracySum = 0;

      // Simular predições para cada sorteio histórico
      for (let i = 10; i < historicalDraws.length; i++) { // usar últimos 10 para contexto
        const contextDraws = historicalDraws.slice(i - 10, i);
        const targetDraw = historicalDraws[i];
        
        if (!targetDraw.drawnNumbers || targetDraw.drawnNumbers.length === 0) continue;

        // Gerar predição baseada no contexto histórico
        const prediction = await this.generateHistoricalPrediction(
          lotteryId,
          contextDraws,
          strategy,
          testParameters
        );

        const matches = this.calculateMatches(prediction, targetDraw.drawnNumbers);
        const accuracy = this.calculateAccuracy(matches, prediction.length, targetDraw.drawnNumbers.length);

        results.push({
          predicted: prediction,
          actual: targetDraw.drawnNumbers,
          matches
        });

        totalMatches += matches;
        totalPredictions++;
        accuracySum += accuracy;
      }

      // Calcular métricas
      const metrics = this.calculateBacktestMetrics(results);
      
      // Salvar resultado do backtesting
      const backtestResult: InsertBacktestResult = {
        testName,
        modelName,
        lotteryId,
        strategy,
        periodStart: new Date(historicalDraws[10].drawDate),
        periodEnd: new Date(historicalDraws[historicalDraws.length - 1].drawDate),
        totalTests: totalPredictions,
        successfulPredictions: results.filter(r => r.matches >= 2).length,
        averageAccuracy: (accuracySum / totalPredictions).toFixed(4),
        profitability: this.calculateProfitability(results).toFixed(2),
        maxDrawdown: metrics.consistency.toFixed(4),
        sharpeRatio: metrics.f1Score.toFixed(4),
        testResults: { results, metrics, parameters: testParameters },
        conclusions: this.generateBacktestConclusions(metrics, totalPredictions)
      };

      await storage.saveBacktestResult(backtestResult);
      
      console.log(`🎯 Backtesting concluído: ${(metrics.accuracy * 100).toFixed(1)}% precisão média`);
      return metrics;
    } catch (error) {
      console.error('Erro no backtesting:', error);
      throw new Error('Falha no backtesting');
    }
  }

  /**
   * ⚔️ Comparar performance de duas estratégias
   */
  async compareStrategies(
    strategyA: string,
    strategyB: string,
    lotteryId: string,
    periodDays: number = 30
  ): Promise<any> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (periodDays * 24 * 60 * 60 * 1000));

      const comparison = await storage.compareStrategies(
        strategyA,
        strategyB,
        lotteryId,
        startDate,
        endDate
      );

      // Buscar métricas detalhadas
      const performanceA = await storage.getModelPerformances(lotteryId);
      const performanceB = await storage.getModelPerformances(lotteryId);

      const detailedComparison = {
        comparison,
        strategyA: {
          name: strategyA,
          performance: performanceA.find(p => p.modelName.includes(strategyA)),
          wins: comparison.strategyAWins,
          winRate: comparison.strategyAWins / (comparison.draws || 1)
        },
        strategyB: {
          name: strategyB,
          performance: performanceB.find(p => p.modelName.includes(strategyB)),
          wins: comparison.strategyBWins,
          winRate: comparison.strategyBWins / (comparison.draws || 1)
        },
        recommendation: this.generateStrategyRecommendation(comparison)
      };

      console.log(`⚔️ Comparação ${strategyA} vs ${strategyB}: ${comparison.winnerStrategy} venceu`);
      return detailedComparison;
    } catch (error) {
      console.error('Erro na comparação de estratégias:', error);
      throw new Error('Falha na comparação de estratégias');
    }
  }

  /**
   * 📈 Obter relatório de performance de um modelo
   */
  async getModelPerformanceReport(modelName: string, lotteryId: string): Promise<any> {
    try {
      const performance = await storage.getOrCreateModelPerformance(modelName, lotteryId);
      const backtestResults = await storage.getBacktestResults(modelName, lotteryId);

      return {
        model: {
          name: modelName,
          lotteryId,
          grade: performance.performanceGrade,
          isActive: performance.isActive
        },
        metrics: {
          totalPredictions: performance.totalPredictions,
          successRate: performance.totalCorrectPredictions / (performance.totalPredictions || 1),
          averageAccuracy: parseFloat(performance.averageAccuracy?.toString() || '0'),
          averageConfidence: parseFloat(performance.averageConfidence?.toString() || '0'),
          bestAccuracy: parseFloat(performance.bestAccuracy?.toString() || '0'),
          worstAccuracy: parseFloat(performance.worstAccuracy?.toString() || '0')
        },
        trends: {
          isImproving: this.calculateTrend(backtestResults),
          consistency: this.calculateConsistency(backtestResults),
          reliability: this.calculateReliability(performance)
        },
        recommendations: this.generateModelRecommendations(performance, backtestResults),
        lastEvaluation: performance.lastEvaluationDate
      };
    } catch (error) {
      console.error('Erro ao gerar relatório de performance:', error);
      throw new Error('Falha ao gerar relatório');
    }
  }

  // ===== MÉTODOS AUXILIARES =====

  private calculateMatches(predicted: number[], actual: number[]): number {
    return predicted.filter(num => actual.includes(num)).length;
  }

  private calculateAccuracy(matches: number, predictedLength: number, actualLength: number): number {
    // Usar precisão baseada na porcentagem de números corretos
    return matches / Math.min(predictedLength, actualLength);
  }

  private calculateBacktestMetrics(results: Array<{ matches: number }>): BacktestMetrics {
    const totalTests = results.length;
    const successfulPredictions = results.filter(r => r.matches >= 2).length;
    
    const accuracy = successfulPredictions / totalTests;
    const precision = accuracy; // simplificado
    const recall = accuracy; // simplificado
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    
    // Calcular consistência baseada na variação dos resultados
    const matchCounts = results.map(r => r.matches);
    const avgMatches = matchCounts.reduce((a, b) => a + b, 0) / totalTests;
    const variance = matchCounts.reduce((sum, matches) => sum + Math.pow(matches - avgMatches, 2), 0) / totalTests;
    const consistency = 1 / (1 + variance); // quanto menor a variação, maior a consistência

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      consistency,
      profitability: this.calculateProfitability(results)
    };
  }

  private calculateProfitability(results: Array<{ matches: number }>): number {
    // Simular lucro/prejuízo baseado em acertos
    let profit = 0;
    for (const result of results) {
      profit -= 1; // custo do jogo
      if (result.matches >= 4) profit += 50; // prêmio grande
      else if (result.matches >= 3) profit += 5; // prêmio médio
      else if (result.matches >= 2) profit += 1; // prêmio pequeno
    }
    return profit;
  }

  private async generateHistoricalPrediction(
    lotteryId: string,
    contextDraws: LotteryDraw[],
    strategy: string,
    parameters: Record<string, any>
  ): Promise<number[]> {
    // Implementação simplificada - usar últimos números como base
    const allNumbers: number[] = [];
    contextDraws.forEach(draw => {
      if (draw.drawnNumbers) {
        allNumbers.push(...draw.drawnNumbers);
      }
    });

    // Contar frequência
    const frequency: Record<number, number> = {};
    allNumbers.forEach(num => {
      frequency[num] = (frequency[num] || 0) + 1;
    });

    // Selecionar números baseado na estratégia
    const sortedNumbers = Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .map(([num]) => parseInt(num));

    // Retornar primeiros 6 números (ou quantidade específica da loteria)
    return sortedNumbers.slice(0, 6);
  }

  private calculateTrend(backtestResults: any[]): boolean {
    if (backtestResults.length < 2) return false;
    
    const recent = backtestResults.slice(0, 3);
    const older = backtestResults.slice(-3);
    
    const recentAvg = recent.reduce((sum, r) => sum + parseFloat(r.averageAccuracy || '0'), 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + parseFloat(r.averageAccuracy || '0'), 0) / older.length;
    
    return recentAvg > olderAvg;
  }

  private calculateConsistency(backtestResults: any[]): number {
    if (backtestResults.length === 0) return 0;
    
    const accuracies = backtestResults.map(r => parseFloat(r.averageAccuracy || '0'));
    const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - avg, 2), 0) / accuracies.length;
    
    return 1 / (1 + variance); // quanto menor a variação, maior a consistência
  }

  private calculateReliability(performance: ModelPerformance): number {
    const totalPredictions = performance.totalPredictions || 1;
    const avgAccuracy = parseFloat(performance.averageAccuracy?.toString() || '0');
    const avgConfidence = parseFloat(performance.averageConfidence?.toString() || '0');
    
    // Combinar quantidade de dados, precisão e confiança
    const dataReliability = Math.min(totalPredictions / 100, 1); // normalizar até 100 predições
    const performanceReliability = avgAccuracy;
    const confidenceReliability = avgConfidence;
    
    return (dataReliability + performanceReliability + confidenceReliability) / 3;
  }

  private generateBacktestConclusions(metrics: BacktestMetrics, totalTests: number): string {
    let conclusions = `Teste realizado em ${totalTests} sorteios. `;
    
    if (metrics.accuracy > 0.6) {
      conclusions += "Performance excelente com alta precisão. ";
    } else if (metrics.accuracy > 0.4) {
      conclusions += "Performance aceitável com precisão moderada. ";
    } else {
      conclusions += "Performance baixa, modelo precisa de ajustes. ";
    }

    if (metrics.consistency > 0.7) {
      conclusions += "Resultados consistentes. ";
    } else {
      conclusions += "Resultados inconsistentes, alta variabilidade. ";
    }

    if (metrics.profitability > 0) {
      conclusions += "Estratégia potencialmente lucrativa. ";
    } else {
      conclusions += "Estratégia apresenta prejuízo simulado. ";
    }

    return conclusions;
  }

  private generateStrategyRecommendation(comparison: any): string {
    if (comparison.draws < 10) {
      return "Dados insuficientes para recomendação confiável. Continue testando.";
    }

    const winDifference = Math.abs(comparison.strategyAWins - comparison.strategyBWins);
    const significanceThreshold = comparison.draws * 0.1; // 10% de diferença

    if (winDifference < significanceThreshold) {
      return "Estratégias apresentam performance similar. Recomenda-se combinar ambas.";
    }

    const winner = comparison.winnerStrategy;
    return `Estratégia ${winner} demonstra superioridade significativa. Recomenda-se focar nesta abordagem.`;
  }

  private generateModelRecommendations(performance: ModelPerformance, backtestResults: any[]): string[] {
    const recommendations: string[] = [];
    
    const avgAccuracy = parseFloat(performance.averageAccuracy?.toString() || '0');
    const totalPredictions = performance.totalPredictions || 0;
    
    if (avgAccuracy < 0.3) {
      recommendations.push("Precisão baixa - revisar algoritmo de predição");
    }
    
    if (totalPredictions < 50) {
      recommendations.push("Poucos dados - coletar mais predições para análise confiável");
    }
    
    if (!this.calculateTrend(backtestResults)) {
      recommendations.push("Tendência de queda - considerar ajustes nos parâmetros");
    }
    
    if (performance.performanceGrade === 'F') {
      recommendations.push("Performance crítica - reavaliar estratégia completamente");
    }

    if (recommendations.length === 0) {
      recommendations.push("Modelo funcionando bem - manter monitoramento contínuo");
    }

    return recommendations;
  }
}

export const performanceService = new PerformanceService();