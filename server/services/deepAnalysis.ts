
/**
 * 🔬 ANÁLISE PROFUNDA DE CORRELAÇÃO E PADRÕES
 * Sistema avançado que detecta relações complexas entre números
 */

interface CorrelationMatrix {
  calculateCorrelationMatrix: (draws: any[], maxNumber: number) => Map<string, number>;
  selectCorrelatedNumbers: (baseNumbers: number[], matrix: Map<string, number>, count: number, maxNumber: number, usedNumbers: Set<number>) => number[];
  calculateSetCorrelationScore: (numbers: number[], matrix: Map<string, number>) => number;
  analyzeConsecutiveSequences: (draws: any[], minLength: number) => any[];
  findNumberTrios: (draws: any[], minFrequency: number) => any[];
  calculateDispersionMetrics: (frequencies: any[]) => any;
  analyzeDelayByPosition: (draws: any[], maxNumber: number) => Map<number, any>;
}

interface PatternRecognition {
  detectPatterns: (draws: any[]) => any;
  detectFibonacciPatterns: (draws: any[], maxNumber: number) => number[];
  detectPrimePatterns: (draws: any[], maxNumber: number) => number[];
  calculateSurpriseScore: (numbers: number[], draws: any[]) => number;
}

export const deepAnalysis = {
  correlationAnalysis: {
    calculateCorrelationMatrix: (draws: any[], maxNumber: number): Map<string, number> => {
      const pairCounts = new Map<string, number>();
      const individualCounts = new Map<number, number>();

      draws.forEach(draw => {
        if (!draw.drawnNumbers) return;
        
        draw.drawnNumbers.forEach((num: number) => {
          individualCounts.set(num, (individualCounts.get(num) || 0) + 1);
        });

        for (let i = 0; i < draw.drawnNumbers.length; i++) {
          for (let j = i + 1; j < draw.drawnNumbers.length; j++) {
            const key = `${Math.min(draw.drawnNumbers[i], draw.drawnNumbers[j])}-${Math.max(draw.drawnNumbers[i], draw.drawnNumbers[j])}`;
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
          }
        }
      });

      const matrix = new Map<string, number>();
      const totalDraws = draws.length;

      for (let i = 1; i <= maxNumber; i++) {
        for (let j = i + 1; j <= maxNumber; j++) {
          const key = `${i}-${j}`;
          const pairCount = pairCounts.get(key) || 0;
          const countI = individualCounts.get(i) || 0;
          const countJ = individualCounts.get(j) || 0;

          if (pairCount > 0) {
            const expectedPairs = (countI / totalDraws) * (countJ / totalDraws) * totalDraws;
            const correlation = expectedPairs > 0 ? (pairCount - expectedPairs) / Math.sqrt(expectedPairs) : 0;
            
            if (Math.abs(correlation) > 0.1) {
              matrix.set(key, correlation);
            }
          }
        }
      }

      return matrix;
    },

    selectCorrelatedNumbers: (
      baseNumbers: number[],
      matrix: Map<string, number>,
      count: number,
      maxNumber: number,
      usedNumbers: Set<number>
    ): number[] => {
      const scores = new Map<number, number>();

      for (let num = 1; num <= maxNumber; num++) {
        if (usedNumbers.has(num)) continue;

        let totalScore = 0;
        baseNumbers.forEach(baseNum => {
          const key = baseNum < num ? `${baseNum}-${num}` : `${num}-${baseNum}`;
          totalScore += Math.abs(matrix.get(key) || 0);
        });

        if (totalScore > 0) {
          scores.set(num, totalScore);
        }
      }

      return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([num]) => num);
    },

    calculateSetCorrelationScore: (numbers: number[], matrix: Map<string, number>): number => {
      let totalCorrelation = 0;
      let pairCount = 0;

      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          const key = `${Math.min(numbers[i], numbers[j])}-${Math.max(numbers[i], numbers[j])}`;
          totalCorrelation += Math.abs(matrix.get(key) || 0);
          pairCount++;
        }
      }

      return pairCount > 0 ? totalCorrelation / pairCount : 0;
    },

    analyzeConsecutiveSequences: (draws: any[], minLength: number = 2): any[] => {
      const sequences = new Map<string, { count: number; lastSeen: string }>();

      draws.forEach(draw => {
        if (!draw.drawnNumbers) return;
        
        const sorted = [...draw.drawnNumbers].sort((a, b) => a - b);
        
        for (let i = 0; i < sorted.length - minLength + 1; i++) {
          const sequence = [];
          for (let j = i; j < sorted.length; j++) {
            if (j === i || sorted[j] === sorted[j-1] + 1) {
              sequence.push(sorted[j]);
            } else {
              break;
            }
          }

          if (sequence.length >= minLength) {
            const key = sequence.join('-');
            const existing = sequences.get(key) || { count: 0, lastSeen: '' };
            sequences.set(key, {
              count: existing.count + 1,
              lastSeen: draw.drawDate || ''
            });
          }
        }
      });

      return Array.from(sequences.entries())
        .map(([key, data]) => ({
          sequence: key.split('-').map(Number),
          frequency: data.count,
          lastSeen: data.lastSeen
        }))
        .sort((a, b) => b.frequency - a.frequency);
    },

    findNumberTrios: (draws: any[], minFrequency: number = 2): any[] => {
      const trios = new Map<string, number>();

      draws.forEach(draw => {
        if (!draw.drawnNumbers || draw.drawnNumbers.length < 3) return;
        
        const nums = [...draw.drawnNumbers].sort((a, b) => a - b);
        for (let i = 0; i < nums.length - 2; i++) {
          for (let j = i + 1; j < nums.length - 1; j++) {
            for (let k = j + 1; k < nums.length; k++) {
              const key = `${nums[i]}-${nums[j]}-${nums[k]}`;
              trios.set(key, (trios.get(key) || 0) + 1);
            }
          }
        }
      });

      return Array.from(trios.entries())
        .filter(([_, count]) => count >= minFrequency)
        .map(([key, count]) => ({
          numbers: key.split('-').map(Number),
          frequency: count,
          correlation: count / draws.length
        }))
        .sort((a, b) => b.frequency - a.frequency);
    },

    calculateDispersionMetrics: (frequencies: any[]): any => {
      const values = frequencies.map(f => f.frequency || 0);
      const n = values.length;

      if (n === 0) return { mean: 0, variance: 0, standardDeviation: 0, coefficientOfVariation: 0 };

      const mean = values.reduce((sum, v) => sum + v, 0) / n;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
      const stdDev = Math.sqrt(variance);

      return {
        mean,
        variance,
        standardDeviation: stdDev,
        coefficientOfVariation: mean !== 0 ? (stdDev / mean) * 100 : 0
      };
    },

    analyzeDelayByPosition: (draws: any[], maxNumber: number): Map<number, any> => {
      const lastSeen = new Map<number, number>();
      const delays = new Map<number, number[]>();

      for (let i = 1; i <= maxNumber; i++) {
        delays.set(i, []);
      }

      draws.forEach((draw, index) => {
        if (!draw.drawnNumbers) return;

        draw.drawnNumbers.forEach((num: number) => {
          if (lastSeen.has(num)) {
            const delay = index - lastSeen.get(num)!;
            delays.get(num)!.push(delay);
          }
          lastSeen.set(num, index);
        });
      });

      const result = new Map<number, any>();
      
      for (let num = 1; num <= maxNumber; num++) {
        const numDelays = delays.get(num) || [];
        const currentDelay = lastSeen.has(num) ? draws.length - 1 - lastSeen.get(num)! : draws.length;
        
        if (numDelays.length > 0) {
          const avgDelay = numDelays.reduce((sum, d) => sum + d, 0) / numDelays.length;
          result.set(num, {
            averageDelay: avgDelay,
            currentDelay,
            maxDelay: Math.max(...numDelays),
            minDelay: Math.min(...numDelays)
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
  },

  patternRecognition: {
    detectPatterns: (draws: any[]): any => {
      return {
        hasConsecutive: false,
        cycles: [],
        trends: 'neutral'
      };
    },

    detectFibonacciPatterns: (draws: any[], maxNumber: number): number[] => {
      const fib = [1, 1];
      while (fib[fib.length - 1] < maxNumber) {
        fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
      }

      const fibSet = new Set(fib.filter(n => n <= maxNumber));
      const counts = new Map<number, number>();

      draws.forEach(draw => {
        if (draw.drawnNumbers) {
          draw.drawnNumbers.forEach((num: number) => {
            if (fibSet.has(num)) {
              counts.set(num, (counts.get(num) || 0) + 1);
            }
          });
        }
      });

      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([num]) => num);
    },

    detectPrimePatterns: (draws: any[], maxNumber: number): number[] => {
      const isPrime = (n: number) => {
        if (n < 2) return false;
        for (let i = 2; i <= Math.sqrt(n); i++) {
          if (n % i === 0) return false;
        }
        return true;
      };

      const primes = Array.from({ length: maxNumber }, (_, i) => i + 1).filter(isPrime);
      const counts = new Map<number, number>();

      draws.forEach(draw => {
        if (draw.drawnNumbers) {
          draw.drawnNumbers.forEach((num: number) => {
            if (primes.includes(num)) {
              counts.set(num, (counts.get(num) || 0) + 1);
            }
          });
        }
      });

      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([num]) => num);
    },

    calculateSurpriseScore: (numbers: number[], draws: any[]): number => {
      const recentNumbers = new Set<number>();
      draws.slice(0, 10).forEach(draw => {
        if (draw.drawnNumbers) {
          draw.drawnNumbers.forEach((n: number) => recentNumbers.add(n));
        }
      });

      const surpriseCount = numbers.filter(n => !recentNumbers.has(n)).length;
      return surpriseCount / numbers.length;
    }
  }
};
