
/**
 * 🧬 GERADOR BASEADO EM ALGORITMO GENÉTICO OTIMIZADO
 * 
 * Implementação completa com:
 * - Penalização de sequências
 * - Balanceamento par/ímpar
 * - Distribuição por faixas (buckets)
 * - Diversidade entre jogos
 * - Crossover e mutação adaptativos
 */

export type Game = number[];

interface GAParams {
  poolSize: number;
  pick: number;
  populationSize: number;
  generations: number;
  mutationRate: number;
  elitePercent: number;
}

interface ScoredGame {
  game: Game;
  score: number;
  metrics: GameMetrics;
}

interface GameMetrics {
  sequencePenalty: number;
  parityBalance: number;
  bucketDiversity: number;
  sumDeviation: number;
  finalScore: number;
}

/**
 * Embaralha array in-place (Fisher-Yates)
 */
function shuffle<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Gera jogo aleatório
 */
function randomGame(poolSize: number, pick: number): Game {
  const nums = Array.from({ length: poolSize }, (_, i) => i + 1);
  shuffle(nums);
  return nums.slice(0, pick).sort((a, b) => a - b);
}

/**
 * Calcula fitness de um jogo (quanto maior, melhor)
 */
export function calculateFitness(game: Game, poolSize: number = 60): GameMetrics {
  // 1. PENALIDADE POR SEQUÊNCIAS CONSECUTIVAS
  let sequencePenalty = 0;
  for (let i = 1; i < game.length; i++) {
    if (game[i] === game[i - 1] + 1) {
      sequencePenalty++;
    }
  }

  // 2. BALANCEAMENTO PARES/ÍMPARES
  const pares = game.filter(n => n % 2 === 0).length;
  const impares = game.length - pares;
  const parityBalance = Math.abs(pares - impares);

  // 3. DISTRIBUIÇÃO POR FAIXAS (buckets de 10)
  const numBuckets = Math.ceil(poolSize / 10);
  const buckets = Array(numBuckets).fill(0);
  for (const n of game) {
    const bucketIndex = Math.floor((n - 1) / 10);
    if (bucketIndex < numBuckets) {
      buckets[bucketIndex]++;
    }
  }
  const occupiedBuckets = buckets.filter(x => x > 0).length;
  const bucketDiversity = occupiedBuckets;

  // 4. DESVIO DA SOMA IDEAL
  const sum = game.reduce((a, b) => a + b, 0);
  const idealSum = (poolSize / 2) * game.length;
  const sumDeviation = Math.abs(sum - idealSum);

  // FÓRMULA FINAL DE FITNESS (ajustável)
  const finalScore = 
    bucketDiversity * 15 -
    sequencePenalty * 8 -
    parityBalance * 5 -
    sumDeviation * 0.05;

  return {
    sequencePenalty,
    parityBalance,
    bucketDiversity,
    sumDeviation,
    finalScore
  };
}

/**
 * Seleção por torneio
 */
function tournamentSelect(population: ScoredGame[], tournamentSize: number = 3): ScoredGame {
  const contestants: ScoredGame[] = [];
  for (let i = 0; i < tournamentSize; i++) {
    contestants.push(population[Math.floor(Math.random() * population.length)]);
  }
  contestants.sort((a, b) => b.score - a.score);
  return contestants[0];
}

/**
 * Crossover de dois jogos (ponto único)
 */
function crossover(parent1: Game, parent2: Game): Game {
  const point = Math.floor(Math.random() * parent1.length);
  const child = new Set<number>();

  // Pegar primeira parte do parent1
  for (let i = 0; i < point; i++) {
    child.add(parent1[i]);
  }

  // Completar com parent2
  for (const num of parent2) {
    if (child.size >= parent1.length) break;
    child.add(num);
  }

  // Se ainda não completou, adicionar números faltantes
  if (child.size < parent1.length) {
    const allNums = Array.from({ length: Math.max(...parent1, ...parent2) }, (_, i) => i + 1);
    for (const num of allNums) {
      if (child.size >= parent1.length) break;
      if (!child.has(num)) child.add(num);
    }
  }

  return Array.from(child).sort((a, b) => a - b);
}

/**
 * Mutação: troca alguns números
 */
function mutate(game: Game, poolSize: number, mutationRate: number): void {
  const numMutations = Math.max(1, Math.floor(game.length * mutationRate));
  
  for (let i = 0; i < numMutations; i++) {
    const indexToMutate = Math.floor(Math.random() * game.length);
    let newNum: number;
    
    // Gerar novo número que não está no jogo
    do {
      newNum = Math.floor(Math.random() * poolSize) + 1;
    } while (game.includes(newNum));
    
    game[indexToMutate] = newNum;
  }
  
  game.sort((a, b) => a - b);
}

/**
 * Calcula distância de Hamming entre dois jogos
 */
function hammingDistance(game1: Game, game2: Game): number {
  const set1 = new Set(game1);
  const set2 = new Set(game2);
  let diff = 0;
  
  for (const num of set1) {
    if (!set2.has(num)) diff++;
  }
  for (const num of set2) {
    if (!set1.has(num)) diff++;
  }
  
  return diff;
}

/**
 * Garante diversidade entre jogos gerados
 */
function ensureDiversity(games: Game[], minDistance: number = 3): Game[] {
  const diverse: Game[] = [games[0]];
  
  for (const candidate of games.slice(1)) {
    let isDiverse = true;
    
    for (const existing of diverse) {
      if (hammingDistance(candidate, existing) < minDistance) {
        isDiverse = false;
        break;
      }
    }
    
    if (isDiverse) {
      diverse.push(candidate);
    }
  }
  
  return diverse;
}

/**
 * FUNÇÃO PRINCIPAL: Gera jogos usando Algoritmo Genético
 */
export function generateGamesGA(params: Partial<GAParams> = {}, numGames: number = 10): ScoredGame[] {
  const config: GAParams = {
    poolSize: params.poolSize || 60,
    pick: params.pick || 6,
    populationSize: params.populationSize || 200,
    generations: params.generations || 100,
    mutationRate: params.mutationRate || 0.15,
    elitePercent: params.elitePercent || 0.1
  };

  console.log(`🧬 Iniciando GA: População ${config.populationSize}, Gerações ${config.generations}`);

  // População inicial
  let population: Game[] = Array.from(
    { length: config.populationSize },
    () => randomGame(config.poolSize, config.pick)
  );

  // Evolução
  for (let gen = 0; gen < config.generations; gen++) {
    // Calcular fitness
    const scored: ScoredGame[] = population.map(game => {
      const metrics = calculateFitness(game, config.poolSize);
      return {
        game,
        score: metrics.finalScore,
        metrics
      };
    });

    // Ordenar por score
    scored.sort((a, b) => b.score - a.score);

    // Seleção elitista
    const eliteCount = Math.floor(config.populationSize * config.elitePercent);
    const nextGen: Game[] = scored.slice(0, eliteCount).map(s => [...s.game]);

    // Gerar resto da população
    while (nextGen.length < config.populationSize) {
      const parent1 = tournamentSelect(scored);
      const parent2 = tournamentSelect(scored);
      
      let child = crossover(parent1.game, parent2.game);
      
      if (Math.random() < config.mutationRate) {
        mutate(child, config.poolSize, config.mutationRate);
      }
      
      nextGen.push(child);
    }

    population = nextGen;

    // Log a cada 20 gerações
    if ((gen + 1) % 20 === 0) {
      console.log(`  Geração ${gen + 1}: Melhor score = ${scored[0].score.toFixed(2)}`);
    }
  }

  // Avaliação final
  const finalScored: ScoredGame[] = population.map(game => {
    const metrics = calculateFitness(game, config.poolSize);
    return {
      game,
      score: metrics.finalScore,
      metrics
    };
  });

  finalScored.sort((a, b) => b.score - a.score);

  // Garantir diversidade
  const topGames = finalScored.slice(0, numGames * 3).map(s => s.game);
  const diverseGames = ensureDiversity(topGames, config.pick / 2);

  // Retornar top N com diversidade
  const result = diverseGames.slice(0, numGames).map(game => {
    const metrics = calculateFitness(game, config.poolSize);
    return {
      game,
      score: metrics.finalScore,
      metrics
    };
  });

  console.log(`✅ GA concluído: ${result.length} jogos únicos gerados`);
  return result;
}

/**
 * Função auxiliar para testes
 */
export function testGA(): void {
  console.log('🧪 Testando Algoritmo Genético...\n');
  
  const results = generateGamesGA({
    poolSize: 60,
    pick: 6,
    populationSize: 100,
    generations: 50
  }, 5);

  results.forEach((result, i) => {
    console.log(`\nJogo ${i + 1}: [${result.game.join(', ')}]`);
    console.log(`  Score: ${result.score.toFixed(2)}`);
    console.log(`  Sequências: ${result.metrics.sequencePenalty}`);
    console.log(`  Balanceamento P/I: ${result.metrics.parityBalance}`);
    console.log(`  Diversidade buckets: ${result.metrics.bucketDiversity}`);
  });
}
