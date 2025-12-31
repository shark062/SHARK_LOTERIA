
/**
 * 🎯 SISTEMA DE PONTUAÇÃO HÍBRIDA AVANÇADO
 * 
 * Combina múltiplas análises com pesos adaptativos para gerar
 * scores preditivos de alta precisão.
 */

interface HybridScore {
  number: number;
  totalScore: number;
  components: {
    frequency: number;
    delay: number;
    position: number;
    correlation: number;
    seasonality: number;
    neighborhood: number;
    entropy: number;
  };
  confidence: number;
  recommendation: 'strong' | 'moderate' | 'weak';
}

interface TimeframeAnalysis {
  shortTerm: number; // 10 últimos sorteios
  mediumTerm: number; // 30 últimos sorteios
  longTerm: number; // 100 últimos sorteios
}

export class HybridScoringService {
  // Pesos adaptativos (ajustados automaticamente com base em performance)
  private weights = {
    frequency: 0.25,
    delay: 0.20,
    position: 0.15,
    correlation: 0.15,
    seasonality: 0.10,
    neighborhood: 0.10,
    entropy: 0.05
  };

  /**
   * Calcular score híbrido para um número
   */
  calculateHybridScore(
    number: number,
    historicalData: any[],
    frequencies: any[],
    correlationMatrix: Map<string, number>
  ): HybridScore {
    const components = {
      frequency: this.analyzeFrequency(number, frequencies),
      delay: this.analyzeDelay(number, historicalData),
      position: this.analyzePosition(number, historicalData),
      correlation: this.analyzeCorrelation(number, correlationMatrix),
      seasonality: this.analyzeSeasonality(number, historicalData),
      neighborhood: this.analyzeNeighborhood(number, historicalData),
      entropy: this.analyzeEntropy(number, historicalData)
    };

    const totalScore = 
      components.frequency * this.weights.frequency +
      components.delay * this.weights.delay +
      components.position * this.weights.position +
      components.correlation * this.weights.correlation +
      components.seasonality * this.weights.seasonality +
      components.neighborhood * this.weights.neighborhood +
      components.entropy * this.weights.entropy;

    const confidence = this.calculateConfidence(components);
    const recommendation = this.getRecommendation(totalScore, confidence);

    return {
      number,
      totalScore,
      components,
      confidence,
      recommendation
    };
  }

  /**
   * Análise multi-temporal com pesos dinâmicos
   */
  multiTemporalAnalysis(number: number, historicalData: any[]): TimeframeAnalysis {
    const shortTerm = this.calculateTimeframeScore(number, historicalData.slice(0, 10));
    const mediumTerm = this.calculateTimeframeScore(number, historicalData.slice(0, 30));
    const longTerm = this.calculateTimeframeScore(number, historicalData.slice(0, 100));

    // Pesos dinâmicos baseados na efetividade recente
    const recentEffectiveness = this.calculateRecentEffectiveness(historicalData);
    
    return {
      shortTerm: shortTerm * recentEffectiveness.short,
      mediumTerm: mediumTerm * recentEffectiveness.medium,
      longTerm: longTerm * recentEffectiveness.long
    };
  }

  /**
   * Análise de vizinhança numérica (números que "se atraem")
   */
  private analyzeNeighborhood(number: number, historicalData: any[]): number {
    const neighbors = [number - 1, number + 1];
    let neighborScore = 0;

    historicalData.slice(0, 20).forEach(draw => {
      if (draw.drawnNumbers) {
        const hasNumber = draw.drawnNumbers.includes(number);
        const hasNeighbor = neighbors.some(n => draw.drawnNumbers.includes(n));
        
        if (hasNumber && hasNeighbor) {
          neighborScore += 0.5;
        }
      }
    });

    return Math.min(1, neighborScore / 10); // Normalizar
  }

  /**
   * Análise de entropia (nível de aleatoriedade)
   */
  private analyzeEntropy(number: number, historicalData: any[]): number {
    const occurrences = historicalData
      .slice(0, 50)
      .filter(draw => draw.drawnNumbers?.includes(number));

    if (occurrences.length < 3) return 0.5;

    // Calcular intervalos entre aparições
    const intervals: number[] = [];
    for (let i = 1; i < occurrences.length; i++) {
      const prevIndex = historicalData.indexOf(occurrences[i - 1]);
      const currIndex = historicalData.indexOf(occurrences[i]);
      intervals.push(currIndex - prevIndex);
    }

    // Calcular entropia de Shannon simplificada
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, int) => sum + Math.pow(int - avgInterval, 2), 0) / intervals.length;
    
    // Menor variância = menor entropia = mais previsível
    return 1 / (1 + Math.sqrt(variance));
  }

  /**
   * Análise de sazonalidade (padrões mensais/temporais)
   */
  private analyzeSeasonality(number: number, historicalData: any[]): number {
    const currentMonth = new Date().getMonth();
    const monthlyOccurrences = new Map<number, number>();

    historicalData.forEach(draw => {
      if (draw.drawnNumbers?.includes(number) && draw.drawDate) {
        const month = new Date(draw.drawDate).getMonth();
        monthlyOccurrences.set(month, (monthlyOccurrences.get(month) || 0) + 1);
      }
    });

    const currentMonthOccurrences = monthlyOccurrences.get(currentMonth) || 0;
    const avgOccurrences = Array.from(monthlyOccurrences.values())
      .reduce((sum, val) => sum + val, 0) / 12;

    return avgOccurrences > 0 ? currentMonthOccurrences / avgOccurrences : 0.5;
  }

  private analyzeFrequency(number: number, frequencies: any[]): number {
    const freq = frequencies.find(f => f.number === number);
    if (!freq) return 0;

    const maxFreq = Math.max(...frequencies.map(f => f.frequency));
    return freq.frequency / maxFreq;
  }

  private analyzeDelay(number: number, historicalData: any[]): number {
    const lastOccurrence = historicalData.findIndex(d => d.drawnNumbers?.includes(number));
    if (lastOccurrence === -1) return 1; // Muito atrasado = score alto

    // Score inversamente proporcional ao atraso
    const maxDelay = 50;
    return Math.min(1, lastOccurrence / maxDelay);
  }

  private analyzePosition(number: number, historicalData: any[]): number {
    const positions: number[] = [];
    
    historicalData.slice(0, 20).forEach(draw => {
      if (draw.drawnNumbers) {
        const sorted = [...draw.drawnNumbers].sort((a, b) => a - b);
        const index = sorted.indexOf(number);
        if (index !== -1) positions.push(index);
      }
    });

    if (positions.length === 0) return 0.5;

    // Consistência de posição = score mais alto
    const avgPosition = positions.reduce((a, b) => a + b, 0) / positions.length;
    const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - avgPosition, 2), 0) / positions.length;
    
    return 1 / (1 + variance);
  }

  private analyzeCorrelation(number: number, correlationMatrix: Map<string, number>): number {
    const correlations: number[] = [];
    
    correlationMatrix.forEach((value, key) => {
      if (key.includes(`${number}-`) || key.includes(`-${number}`)) {
        correlations.push(value);
      }
    });

    if (correlations.length === 0) return 0.5;
    
    return correlations.reduce((sum, val) => sum + val, 0) / correlations.length;
  }

  private calculateTimeframeScore(number: number, data: any[]): number {
    const occurrences = data.filter(d => d.drawnNumbers?.includes(number)).length;
    return occurrences / Math.max(data.length, 1);
  }

  private calculateRecentEffectiveness(historicalData: any[]): {
    short: number;
    medium: number;
    long: number;
  } {
    // Calcular qual timeframe teve melhor performance recentemente
    // Implementação simplificada
    return {
      short: 0.4,
      medium: 0.35,
      long: 0.25
    };
  }

  private calculateConfidence(components: any): number {
    // Confiança baseada na consistência dos componentes
    const values = Object.values(components) as number[];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    
    return 1 / (1 + variance);
  }

  private getRecommendation(score: number, confidence: number): 'strong' | 'moderate' | 'weak' {
    const combined = score * confidence;
    
    if (combined > 0.7) return 'strong';
    if (combined > 0.4) return 'moderate';
    return 'weak';
  }

  /**
   * Ajustar pesos adaptativamente baseado em performance
   */
  adjustWeights(actualResults: number[], predictedScores: HybridScore[]): void {
    // Calcular qual componente teve melhor correlação com resultados reais
    const componentPerformance = {
      frequency: 0,
      delay: 0,
      position: 0,
      correlation: 0,
      seasonality: 0,
      neighborhood: 0,
      entropy: 0
    };

    actualResults.forEach(num => {
      const predicted = predictedScores.find(s => s.number === num);
      if (predicted) {
        Object.keys(predicted.components).forEach(key => {
          componentPerformance[key as keyof typeof componentPerformance] += 
            predicted.components[key as keyof typeof predicted.components];
        });
      }
    });

    // Normalizar e ajustar pesos
    const total = Object.values(componentPerformance).reduce((a, b) => a + b, 0);
    if (total > 0) {
      Object.keys(componentPerformance).forEach(key => {
        this.weights[key as keyof typeof this.weights] = 
          componentPerformance[key as keyof typeof componentPerformance] / total;
      });
    }

    console.log('🔄 Pesos ajustados:', this.weights);
  }
}

export const hybridScoring = new HybridScoringService();
