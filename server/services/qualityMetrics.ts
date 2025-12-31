
/**
 * 📊 SISTEMA DE MÉTRICAS DE QUALIDADE
 * Avalia a qualidade das previsões e dados
 */

export class QualityMetricsService {
  
  /**
   * Calcular métricas de qualidade dos dados
   */
  calculateDataQuality(draws: any[]): {
    completeness: number;
    consistency: number;
    timeliness: number;
    overall: number;
  } {
    if (draws.length === 0) {
      return { completeness: 0, consistency: 0, timeliness: 0, overall: 0 };
    }

    // Completude: % de sorteios com dados completos
    const completeDraws = draws.filter(d => 
      d.drawnNumbers && 
      d.drawnNumbers.length > 0 && 
      d.drawDate
    ).length;
    const completeness = (completeDraws / draws.length) * 100;

    // Consistência: variação de números por sorteio
    const numberCounts = draws
      .filter(d => d.drawnNumbers)
      .map(d => d.drawnNumbers.length);
    
    const avgCount = numberCounts.reduce((sum, c) => sum + c, 0) / numberCounts.length;
    const variance = numberCounts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / numberCounts.length;
    const consistency = Math.max(0, 100 - (variance * 10));

    // Temporalidade: quão recentes são os dados
    const latestDraw = draws[0];
    const daysSinceLatest = latestDraw?.drawDate 
      ? Math.floor((Date.now() - new Date(latestDraw.drawDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const timeliness = Math.max(0, 100 - (daysSinceLatest * 2));

    const overall = (completeness + consistency + timeliness) / 3;

    return {
      completeness: Math.round(completeness),
      consistency: Math.round(consistency),
      timeliness: Math.round(timeliness),
      overall: Math.round(overall)
    };
  }

  /**
   * Calcular acurácia das previsões
   */
  calculatePredictionAccuracy(predictions: any[], actualResults: any[]): {
    exactMatches: number;
    partialMatches: number;
    averageHits: number;
    accuracy: number;
  } {
    if (predictions.length === 0 || actualResults.length === 0) {
      return { exactMatches: 0, partialMatches: 0, averageHits: 0, accuracy: 0 };
    }

    let totalHits = 0;
    let exactMatches = 0;
    let partialMatches = 0;

    predictions.forEach(pred => {
      const actual = actualResults.find(a => a.contestNumber === pred.contestNumber);
      if (!actual) return;

      const hits = pred.numbers.filter((n: number) => actual.drawnNumbers.includes(n)).length;
      totalHits += hits;

      if (hits === pred.numbers.length) exactMatches++;
      else if (hits > 0) partialMatches++;
    });

    const averageHits = totalHits / predictions.length;
    const accuracy = (averageHits / (predictions[0]?.numbers.length || 6)) * 100;

    return {
      exactMatches,
      partialMatches,
      averageHits: Math.round(averageHits * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100
    };
  }

  /**
   * Score de confiança baseado em múltiplos fatores
   */
  calculateConfidenceScore(
    dataQuality: number,
    modelAccuracy: number,
    correlationStrength: number,
    sampleSize: number
  ): number {
    const sampleWeight = Math.min(1, sampleSize / 100);
    
    const score = (
      dataQuality * 0.3 +
      modelAccuracy * 0.4 +
      correlationStrength * 0.2 +
      sampleWeight * 100 * 0.1
    );

    return Math.min(100, Math.round(score));
  }
}

export const qualityMetrics = new QualityMetricsService();
