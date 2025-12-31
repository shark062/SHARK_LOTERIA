
/**
 * 📊 ANÁLISE AVANÇADA DE DADOS
 * 
 * Serviço para análises estatísticas avançadas, heatmaps,
 * filtros personalizados e exportação de relatórios.
 */

import { correlationAnalysis } from './correlationAnalysis';
import { patternRecognition } from './patternRecognition';

interface HeatmapData {
  position: number;
  number: number;
  frequency: number;
  intensity: number;
}

interface FilterCriteria {
  minEven?: number;
  maxEven?: number;
  minOdd?: number;
  maxOdd?: number;
  minSum?: number;
  maxSum?: number;
  includeSequential?: boolean;
  temperaturePreference?: 'hot' | 'warm' | 'cold' | 'mixed';
}

export class AdvancedDataAnalysisService {
  
  /**
   * Gerar heatmap de frequência por posição
   */
  generatePositionHeatmap(historicalDraws: any[], maxNumber: number): HeatmapData[] {
    const positionFrequency = new Map<string, number>();
    
    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 0) {
        const sorted = [...draw.drawnNumbers].sort((a, b) => a - b);
        sorted.forEach((num, position) => {
          const key = `${position}-${num}`;
          positionFrequency.set(key, (positionFrequency.get(key) || 0) + 1);
        });
      }
    });

    const heatmapData: HeatmapData[] = [];
    const maxFreq = Math.max(...Array.from(positionFrequency.values()));

    positionFrequency.forEach((freq, key) => {
      const [position, number] = key.split('-').map(Number);
      heatmapData.push({
        position,
        number,
        frequency: freq,
        intensity: freq / maxFreq
      });
    });

    return heatmapData.sort((a, b) => b.intensity - a.intensity);
  }

  /**
   * Aplicar filtros personalizados aos números
   */
  applyCustomFilters(
    numbers: number[], 
    criteria: FilterCriteria
  ): { passes: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // Filtro de pares/ímpares
    const evenCount = numbers.filter(n => n % 2 === 0).length;
    const oddCount = numbers.length - evenCount;

    if (criteria.minEven && evenCount < criteria.minEven) {
      reasons.push(`Mínimo de ${criteria.minEven} números pares não atingido`);
    }
    if (criteria.maxEven && evenCount > criteria.maxEven) {
      reasons.push(`Máximo de ${criteria.maxEven} números pares excedido`);
    }
    if (criteria.minOdd && oddCount < criteria.minOdd) {
      reasons.push(`Mínimo de ${criteria.minOdd} números ímpares não atingido`);
    }
    if (criteria.maxOdd && oddCount > criteria.maxOdd) {
      reasons.push(`Máximo de ${criteria.maxOdd} números ímpares excedido`);
    }

    // Filtro de soma
    const sum = numbers.reduce((a, b) => a + b, 0);
    if (criteria.minSum && sum < criteria.minSum) {
      reasons.push(`Soma ${sum} abaixo do mínimo ${criteria.minSum}`);
    }
    if (criteria.maxSum && sum > criteria.maxSum) {
      reasons.push(`Soma ${sum} acima do máximo ${criteria.maxSum}`);
    }

    // Filtro de números sequenciais
    if (criteria.includeSequential === false) {
      const sorted = [...numbers].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
          reasons.push('Números sequenciais não permitidos');
          break;
        }
      }
    }

    return {
      passes: reasons.length === 0,
      reasons
    };
  }

  /**
   * Comparar estatísticas entre loterias
   */
  compareLotteries(lottery1Data: any[], lottery2Data: any[]): {
    lottery1: any;
    lottery2: any;
    comparison: any;
  } {
    const stats1 = this.calculateLotteryStats(lottery1Data);
    const stats2 = this.calculateLotteryStats(lottery2Data);

    return {
      lottery1: stats1,
      lottery2: stats2,
      comparison: {
        frequencyDifference: stats1.avgFrequency - stats2.avgFrequency,
        varianceDifference: stats1.variance - stats2.variance,
        sequenceDifference: stats1.sequenceCount - stats2.sequenceCount
      }
    };
  }

  /**
   * Simular apostas e comparar com resultados reais
   */
  simulateBets(
    strategy: string,
    historicalDraws: any[],
    betCount: number
  ): {
    totalBets: number;
    matches: number[];
    totalPrize: number;
    roi: number;
    bestMatch: number;
  } {
    const matches: number[] = [];
    let totalPrize = 0;

    // Simular apostas (simplificado)
    for (let i = 0; i < Math.min(betCount, historicalDraws.length - 1); i++) {
      const predictedNumbers = this.generatePredictionForStrategy(
        strategy, 
        historicalDraws.slice(i + 1)
      );
      
      const actualNumbers = historicalDraws[i].drawnNumbers || [];
      const matchCount = predictedNumbers.filter(n => actualNumbers.includes(n)).length;
      
      matches.push(matchCount);
      totalPrize += this.calculateSimulatedPrize(matchCount);
    }

    const totalCost = betCount * 5; // R$ 5 por aposta
    const roi = totalCost > 0 ? ((totalPrize - totalCost) / totalCost) * 100 : 0;

    return {
      totalBets: betCount,
      matches,
      totalPrize,
      roi,
      bestMatch: Math.max(...matches, 0)
    };
  }

  /**
   * Gerar relatório exportável
   */
  generateReport(lotteryId: string, historicalDraws: any[], frequencies: any[]): {
    summary: any;
    heatmap: HeatmapData[];
    sequences: any[];
    correlations: any[];
    dispersion: any;
    timestamp: string;
  } {
    const maxNumber = Math.max(...frequencies.map(f => f.number));
    
    return {
      summary: this.calculateLotteryStats(historicalDraws),
      heatmap: this.generatePositionHeatmap(historicalDraws, maxNumber),
      sequences: correlationAnalysis.analyzeConsecutiveSequences(historicalDraws, 3),
      correlations: correlationAnalysis.findNumberTrios(historicalDraws, 3),
      dispersion: correlationAnalysis.calculateDispersionMetrics(frequencies),
      timestamp: new Date().toISOString()
    };
  }

  // Métodos auxiliares privados

  private calculateLotteryStats(draws: any[]) {
    const allNumbers: number[] = [];
    let sequenceCount = 0;

    draws.forEach(draw => {
      if (draw.drawnNumbers) {
        allNumbers.push(...draw.drawnNumbers);
        
        const sorted = [...draw.drawnNumbers].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === sorted[i - 1] + 1) {
            sequenceCount++;
          }
        }
      }
    });

    const frequency = new Map<number, number>();
    allNumbers.forEach(num => {
      frequency.set(num, (frequency.get(num) || 0) + 1);
    });

    const frequencies = Array.from(frequency.values());
    const avgFrequency = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
    const variance = frequencies.reduce((sum, f) => sum + Math.pow(f - avgFrequency, 2), 0) / frequencies.length;

    return {
      totalDraws: draws.length,
      totalNumbers: allNumbers.length,
      uniqueNumbers: frequency.size,
      avgFrequency,
      variance,
      stdDev: Math.sqrt(variance),
      sequenceCount,
      mostFrequent: Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([num]) => num)
    };
  }

  private generatePredictionForStrategy(strategy: string, draws: any[]): number[] {
    // Simplificado - retorna números aleatórios
    const maxNum = 60;
    const count = 6;
    const numbers: number[] = [];
    
    while (numbers.length < count) {
      const num = Math.floor(Math.random() * maxNum) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    
    return numbers.sort((a, b) => a - b);
  }

  private calculateSimulatedPrize(matches: number): number {
    const prizeTable: Record<number, number> = {
      6: 50000000,
      5: 50000,
      4: 1000,
      3: 50,
      2: 10
    };
    
    return prizeTable[matches] || 0;
  }
}

export const advancedDataAnalysis = new AdvancedDataAnalysisService();
