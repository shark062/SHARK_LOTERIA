
/**
 * 🔬 ANÁLISE DE CORRELAÇÃO AVANÇADA
 * 
 * Sistema para detectar correlações entre números que frequentemente
 * saem juntos, melhorando a precisão das previsões.
 */

interface NumberCorrelation {
  number1: number;
  number2: number;
  correlation: number;
  frequency: number;
}

export class CorrelationAnalysisService {
  
  /**
   * Calcula matriz de correlação entre todos os números
   */
  calculateCorrelationMatrix(historicalDraws: any[], maxNumber: number): Map<string, number> {
    const correlationMap = new Map<string, number>();
    const coOccurrence = new Map<string, number>();
    const individualCount = new Map<number, number>();

    // Contar co-ocorrências
    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 0) {
        const numbers = draw.drawnNumbers;
        
        // Contar ocorrências individuais
        numbers.forEach((num: number) => {
          individualCount.set(num, (individualCount.get(num) || 0) + 1);
        });

        // Contar pares
        for (let i = 0; i < numbers.length - 1; i++) {
          for (let j = i + 1; j < numbers.length; j++) {
            const key = this.getPairKey(numbers[i], numbers[j]);
            coOccurrence.set(key, (coOccurrence.get(key) || 0) + 1);
          }
        }
      }
    });

    // Calcular correlação normalizada (Jaccard coefficient)
    const totalDraws = historicalDraws.length;
    
    for (let i = 1; i <= maxNumber; i++) {
      for (let j = i + 1; j <= maxNumber; j++) {
        const key = this.getPairKey(i, j);
        const coCount = coOccurrence.get(key) || 0;
        const countI = individualCount.get(i) || 0;
        const countJ = individualCount.get(j) || 0;

        // Jaccard: |A ∩ B| / |A ∪ B|
        const union = countI + countJ - coCount;
        const correlation = union > 0 ? coCount / union : 0;
        
        if (correlation > 0.05) { // Apenas correlações significativas
          correlationMap.set(key, correlation);
        }
      }
    }

    return correlationMap;
  }

  /**
   * Encontra os números mais correlacionados com um número específico
   */
  findHighlyCorrelatedNumbers(
    targetNumber: number,
    correlationMatrix: Map<string, number>,
    maxNumber: number,
    topN: number = 10
  ): number[] {
    const correlations: Array<{ number: number; correlation: number }> = [];

    for (let i = 1; i <= maxNumber; i++) {
      if (i === targetNumber) continue;
      
      const key = this.getPairKey(targetNumber, i);
      const correlation = correlationMatrix.get(key) || 0;
      
      if (correlation > 0) {
        correlations.push({ number: i, correlation });
      }
    }

    return correlations
      .sort((a, b) => b.correlation - a.correlation)
      .slice(0, topN)
      .map(c => c.number);
  }

  /**
   * Seleciona números otimizados usando correlação
   */
  selectCorrelatedNumbers(
    baseNumbers: number[],
    correlationMatrix: Map<string, number>,
    count: number,
    maxNumber: number,
    usedNumbers: Set<number>
  ): number[] {
    const selected: number[] = [];
    const available = Array.from({ length: maxNumber }, (_, i) => i + 1)
      .filter(n => !usedNumbers.has(n));

    // Para cada número base, encontrar correlacionados
    const candidates = new Map<number, number>(); // número -> score de correlação

    baseNumbers.forEach(baseNum => {
      const correlated = this.findHighlyCorrelatedNumbers(baseNum, correlationMatrix, maxNumber, 20);
      
      correlated.forEach((num, index) => {
        if (available.includes(num)) {
          const score = (candidates.get(num) || 0) + (1 / (index + 1)); // Peso decrescente
          candidates.set(num, score);
        }
      });
    });

    // Ordenar por score e selecionar
    const sortedCandidates = Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([num]) => num);

    selected.push(...sortedCandidates);

    // Completar se necessário
    while (selected.length < count && available.length > 0) {
      const remaining = available.filter(n => !selected.includes(n));
      if (remaining.length === 0) break;
      
      selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }

    return selected.sort((a, b) => a - b);
  }

  /**
   * Calcula score de qualidade de um conjunto de números baseado em correlação
   */
  calculateSetCorrelationScore(
    numbers: number[],
    correlationMatrix: Map<string, number>
  ): number {
    let totalCorrelation = 0;
    let pairCount = 0;

    for (let i = 0; i < numbers.length - 1; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        const key = this.getPairKey(numbers[i], numbers[j]);
        totalCorrelation += correlationMatrix.get(key) || 0;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalCorrelation / pairCount : 0;
  }

  private getPairKey(num1: number, num2: number): string {
    return num1 < num2 ? `${num1}-${num2}` : `${num2}-${num1}`;
  }

  /**
   * Detecta sequências temporais (números que aparecem em sorteios consecutivos)
   */
  analyzeTemporalPatterns(historicalDraws: any[], lookback: number = 5): Map<number, number[]> {
    const temporalPatterns = new Map<number, number[]>();

    for (let i = 0; i < historicalDraws.length - 1; i++) {
      const currentDraw = historicalDraws[i].drawnNumbers || [];
      const nextDraw = historicalDraws[i + 1].drawnNumbers || [];

      currentDraw.forEach((num: number) => {
        if (!temporalPatterns.has(num)) {
          temporalPatterns.set(num, []);
        }
        
        nextDraw.forEach((nextNum: number) => {
          temporalPatterns.get(num)!.push(nextNum);
        });
      });
    }

    // Calcular frequências temporais
    const temporalFrequencies = new Map<number, number[]>();
    
    temporalPatterns.forEach((followers, leader) => {
      const frequency = new Map<number, number>();
      followers.forEach(f => {
        frequency.set(f, (frequency.get(f) || 0) + 1);
      });

      const topFollowers = Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, lookback)
        .map(([num]) => num);

      temporalFrequencies.set(leader, topFollowers);
    });

    return temporalFrequencies;
  }

  /**
   * Identifica trios de números que aparecem frequentemente juntos
   */
  findNumberTrios(historicalDraws: any[], minFrequency: number = 3): Array<{
    numbers: [number, number, number];
    frequency: number;
    correlation: number;
  }> {
    const trioMap = new Map<string, number>();

    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length >= 3) {
        const numbers = [...draw.drawnNumbers].sort((a, b) => a - b);
        
        for (let i = 0; i < numbers.length - 2; i++) {
          for (let j = i + 1; j < numbers.length - 1; j++) {
            for (let k = j + 1; k < numbers.length; k++) {
              const key = `${numbers[i]}-${numbers[j]}-${numbers[k]}`;
              trioMap.set(key, (trioMap.get(key) || 0) + 1);
            }
          }
        }
      }
    });

    const totalDraws = historicalDraws.length;
    const trios = Array.from(trioMap.entries())
      .filter(([_, freq]) => freq >= minFrequency)
      .map(([key, freq]) => {
        const [n1, n2, n3] = key.split('-').map(Number);
        return {
          numbers: [n1, n2, n3] as [number, number, number],
          frequency: freq,
          correlation: freq / totalDraws
        };
      })
      .sort((a, b) => b.frequency - a.frequency);

    return trios;
  }

  /**
   * Análise de dispersão de números (desvio padrão e variância)
   */
  calculateDispersionMetrics(frequencies: Array<{ number: number; frequency: number }>): {
    mean: number;
    median: number;
    variance: number;
    standardDeviation: number;
    coefficientOfVariation: number;
  } {
    const values = frequencies.map(f => f.frequency);
    const n = values.length;

    if (n === 0) {
      return {
        mean: 0,
        median: 0,
        variance: 0,
        standardDeviation: 0,
        coefficientOfVariation: 0
      };
    }

    // Média
    const mean = values.reduce((sum, val) => sum + val, 0) / n;

    // Mediana
    const sorted = [...values].sort((a, b) => a - b);
    const median = n % 2 === 0 
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Variância
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;

    // Desvio padrão
    const standardDeviation = Math.sqrt(variance);

    // Coeficiente de variação
    const coefficientOfVariation = mean !== 0 ? (standardDeviation / mean) * 100 : 0;

    return {
      mean,
      median,
      variance,
      standardDeviation,
      coefficientOfVariation
    };
  }

  /**
   * Análise de sequências consecutivas
   */
  analyzeConsecutiveSequences(historicalDraws: any[], minLength: number = 3): Array<{
    sequence: number[];
    frequency: number;
    lastSeen: string;
    positions: number[];
  }> {
    const sequenceMap = new Map<string, { count: number; lastSeen: string; positions: number[] }>();

    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 0) {
        const sorted = [...draw.drawnNumbers].sort((a, b) => a - b);
        
        for (let i = 0; i < sorted.length - minLength + 1; i++) {
          const sequence: number[] = [];
          
          for (let j = i; j < sorted.length; j++) {
            if (j === i) {
              sequence.push(sorted[j]);
            } else if (sorted[j] === sorted[j - 1] + 1) {
              sequence.push(sorted[j]);
            } else {
              break;
            }
          }

          if (sequence.length >= minLength) {
            const key = sequence.join('-');
            const existing = sequenceMap.get(key) || { 
              count: 0, 
              lastSeen: draw.drawDate || '', 
              positions: [] 
            };
            
            existing.count++;
            existing.lastSeen = draw.drawDate || existing.lastSeen;
            existing.positions.push(draw.contestNumber || 0);
            
            sequenceMap.set(key, existing);
          }
        }
      }
    });

    return Array.from(sequenceMap.entries())
      .map(([key, data]) => ({
        sequence: key.split('-').map(Number),
        frequency: data.count,
        lastSeen: data.lastSeen,
        positions: data.positions
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Análise de atraso por posição (delay analysis)
   */
  analyzeDelayByPosition(historicalDraws: any[], maxNumber: number): Map<number, {
    averageDelay: number;
    currentDelay: number;
    maxDelay: number;
    minDelay: number;
  }> {
    const delayData = new Map<number, number[]>();
    const lastSeen = new Map<number, number>();

    // Inicializar
    for (let i = 1; i <= maxNumber; i++) {
      delayData.set(i, []);
    }

    historicalDraws.forEach((draw, index) => {
      if (draw.drawnNumbers) {
        // Atualizar delays para números sorteados
        draw.drawnNumbers.forEach((num: number) => {
          if (lastSeen.has(num)) {
            const delay = index - lastSeen.get(num)!;
            delayData.get(num)!.push(delay);
          }
          lastSeen.set(num, index);
        });
      }
    });

    // Calcular métricas de delay
    const result = new Map<number, {
      averageDelay: number;
      currentDelay: number;
      maxDelay: number;
      minDelay: number;
    }>();

    for (let num = 1; num <= maxNumber; num++) {
      const delays = delayData.get(num) || [];
      const currentDelay = lastSeen.has(num) 
        ? historicalDraws.length - 1 - lastSeen.get(num)!
        : historicalDraws.length;

      if (delays.length > 0) {
        result.set(num, {
          averageDelay: delays.reduce((sum, d) => sum + d, 0) / delays.length,
          currentDelay,
          maxDelay: Math.max(...delays),
          minDelay: Math.min(...delays)
        });
      } else {
        result.set(num, {
          averageDelay: 0,
          currentDelay,
          maxDelay: 0,
          minDelay: 0
        });
      }
    }

    return result;
  }
}

export const correlationAnalysis = new CorrelationAnalysisService();
