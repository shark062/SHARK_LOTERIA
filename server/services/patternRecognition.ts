
/**
 * 🎯 RECONHECIMENTO AVANÇADO DE PADRÕES
 * 
 * Detecta padrões estatísticos complexos que aumentam a precisão
 */

export class PatternRecognitionService {
  
  /**
   * Detecta ciclos de Fibonacci nos números sorteados
   */
  detectFibonacciPatterns(historicalDraws: any[], maxNumber: number): number[] {
    const fibonacci: number[] = [1, 1];
    while (fibonacci[fibonacci.length - 1] < maxNumber) {
      const next = fibonacci[fibonacci.length - 1] + fibonacci[fibonacci.length - 2];
      if (next <= maxNumber) fibonacci.push(next);
    }

    const fibFrequency = new Map<number, number>();
    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => {
          if (fibonacci.includes(num)) {
            fibFrequency.set(num, (fibFrequency.get(num) || 0) + 1);
          }
        });
      }
    });

    return Array.from(fibFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.ceil(fibonacci.length * 0.4))
      .map(([num]) => num);
  }

  /**
   * Detecta números primos com alta frequência
   */
  detectPrimePatterns(historicalDraws: any[], maxNumber: number): number[] {
    const primes = this.generatePrimes(maxNumber);
    const primeFrequency = new Map<number, number>();

    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => {
          if (primes.includes(num)) {
            primeFrequency.set(num, (primeFrequency.get(num) || 0) + 1);
          }
        });
      }
    });

    return Array.from(primeFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.ceil(primes.length * 0.3))
      .map(([num]) => num);
  }

  /**
   * Detecta padrões de soma (números que juntos formam somas específicas)
   */
  detectSumPatterns(historicalDraws: any[], targetCount: number): Map<number, number> {
    const sumFrequency = new Map<number, number>();

    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 0) {
        const sum = draw.drawnNumbers.reduce((a: number, b: number) => a + b, 0);
        sumFrequency.set(sum, (sumFrequency.get(sum) || 0) + 1);
      }
    });

    return sumFrequency;
  }

  /**
   * Analisa distribuição de dezenas (1-10, 11-20, etc.)
   */
  analyzeDecadeDistribution(historicalDraws: any[], maxNumber: number): Map<number, number> {
    const decadeFrequency = new Map<number, number>();
    const decadeCount = Math.ceil(maxNumber / 10);

    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => {
          const decade = Math.floor((num - 1) / 10);
          decadeFrequency.set(decade, (decadeFrequency.get(decade) || 0) + 1);
        });
      }
    });

    return decadeFrequency;
  }

  /**
   * Calcula score de "surpresa" - números que fogem do padrão esperado
   */
  calculateSurpriseScore(numbers: number[], historicalDraws: any[]): number {
    const recentNumbers = new Set<number>();
    historicalDraws.slice(0, 5).forEach(draw => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((n: number) => recentNumbers.add(n));
      }
    });

    const surpriseCount = numbers.filter(n => !recentNumbers.has(n)).length;
    return surpriseCount / numbers.length;
  }

  private generatePrimes(max: number): number[] {
    const primes: number[] = [];
    for (let i = 2; i <= max; i++) {
      if (this.isPrime(i)) primes.push(i);
    }
    return primes;
  }

  private isPrime(num: number): boolean {
    if (num < 2) return false;
    for (let i = 2; i <= Math.sqrt(num); i++) {
      if (num % i === 0) return false;
    }
    return true;
  }

  /**
   * Detecta "números irmãos" - números que frequentemente aparecem em duplas
   */
  detectSiblingNumbers(historicalDraws: any[], maxNumber: number): Map<number, number[]> {
    const siblings = new Map<number, Map<number, number>>();

    // Inicializar
    for (let i = 1; i <= maxNumber; i++) {
      siblings.set(i, new Map<number, number>());
    }

    // Contar aparições conjuntas
    historicalDraws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 1) {
        const nums = draw.drawnNumbers;
        for (let i = 0; i < nums.length - 1; i++) {
          for (let j = i + 1; j < nums.length; j++) {
            const map1 = siblings.get(nums[i])!;
            const map2 = siblings.get(nums[j])!;
            
            map1.set(nums[j], (map1.get(nums[j]) || 0) + 1);
            map2.set(nums[i], (map2.get(nums[i]) || 0) + 1);
          }
        }
      }
    });

    // Extrair top siblings para cada número
    const topSiblings = new Map<number, number[]>();
    siblings.forEach((siblingMap, number) => {
      const sorted = Array.from(siblingMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([n]) => n);
      topSiblings.set(number, sorted);
    });

    return topSiblings;
  }
}

export const patternRecognition = new PatternRecognitionService();
