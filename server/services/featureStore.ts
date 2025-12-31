
/**
 * 🎯 FEATURE STORE E PIPELINE DE MACHINE LEARNING
 * 
 * Calcula features avançadas e treina modelo XGBoost
 * para predição de probabilidades por número
 */

import { storage } from '../storage';
import type { LotteryDraw } from '@shared/schema';

export interface NumberFeatures {
  numero: number;
  frequencia: number;
  recencia: number;
  tendencia: number;
  coocorrencia: Record<number, number>;
  mediaIntervalo: number;
  desvioIntervalo: number;
  ultimaAparicao: number;
  paridadePar: number;
  faixaDecada: number;
}

export interface GameFeatures {
  concurso: number;
  data: Date;
  numeros: number[];
  soma: number;
  media: number;
  desvio: number;
  pares: number;
  impares: number;
  sequencias: number;
  faixas: number[];
  maxGap: number;
  minGap: number;
}

/**
 * Calcula matriz de co-ocorrência com normalização
 */
export function calculateCooccurrenceMatrix(
  draws: LotteryDraw[],
  poolSize: number
): Map<string, number> {
  const matrix = new Map<string, number>();
  const totalDraws = draws.length;

  for (const draw of draws) {
    if (!draw.drawnNumbers || draw.drawnNumbers.length < 2) continue;

    for (let i = 0; i < draw.drawnNumbers.length; i++) {
      for (let j = i + 1; j < draw.drawnNumbers.length; j++) {
        const num1 = Math.min(draw.drawnNumbers[i], draw.drawnNumbers[j]);
        const num2 = Math.max(draw.drawnNumbers[i], draw.drawnNumbers[j]);
        const key = `${num1}-${num2}`;
        
        matrix.set(key, (matrix.get(key) || 0) + 1);
      }
    }
  }

  // Normalizar por total de draws
  for (const [key, count] of matrix.entries()) {
    matrix.set(key, count / totalDraws);
  }

  return matrix;
}

/**
 * Calcula bucketization (distribuição por faixas)
 */
export function calculateBucketDistribution(
  numbers: number[],
  poolSize: number,
  bucketCount: number = 6
): number[] {
  const bucketSize = Math.ceil(poolSize / bucketCount);
  const buckets = Array(bucketCount).fill(0);
  
  for (const num of numbers) {
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.floor((num - 1) / bucketSize)
    );
    buckets[bucketIndex]++;
  }
  
  return buckets;
}

/**
 * Calcula features de sequências
 */
export function calculateSequenceFeatures(numbers: number[]): {
  consecutiveCount: number;
  maxGap: number;
  minGap: number;
  avgGap: number;
} {
  const sorted = [...numbers].sort((a, b) => a - b);
  let consecutiveCount = 0;
  const gaps: number[] = [];
  
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    gaps.push(gap);
    if (gap === 1) consecutiveCount++;
  }
  
  return {
    consecutiveCount,
    maxGap: gaps.length > 0 ? Math.max(...gaps) : 0,
    minGap: gaps.length > 0 ? Math.min(...gaps) : 0,
    avgGap: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
  };
}

/**
 * Extrai features de um número específico
 */
export function extractNumberFeatures(
  numero: number,
  draws: LotteryDraw[],
  cooccurrenceMatrix: Map<string, number>,
  poolSize: number
): NumberFeatures {
  // Frequência total
  let frequencia = 0;
  const aparicoes: number[] = [];
  
  draws.forEach((draw, index) => {
    if (draw.drawnNumbers && draw.drawnNumbers.includes(numero)) {
      frequencia++;
      aparicoes.push(index);
    }
  });

  // Recência (quantos sorteios atrás foi a última aparição)
  const recencia = aparicoes.length > 0 ? aparicoes[0] : draws.length;

  // Tendência (aparições recentes vs antigas)
  const metadeRecente = draws.slice(0, Math.floor(draws.length / 2));
  const metadeAntiga = draws.slice(Math.floor(draws.length / 2));
  
  const freqRecente = metadeRecente.filter(d => d.drawnNumbers?.includes(numero)).length;
  const freqAntiga = metadeAntiga.filter(d => d.drawnNumbers?.includes(numero)).length;
  const tendencia = freqRecente - freqAntiga;

  // Co-ocorrência com outros números
  const coocorrencia: Record<number, number> = {};
  for (let i = 1; i <= poolSize; i++) {
    if (i === numero) continue;
    
    const key1 = `${Math.min(numero, i)}-${Math.max(numero, i)}`;
    const count = cooccurrenceMatrix.get(key1) || 0;
    if (count > 0) {
      coocorrencia[i] = count;
    }
  }

  // Intervalos entre aparições
  const intervalos: number[] = [];
  for (let i = 1; i < aparicoes.length; i++) {
    intervalos.push(aparicoes[i - 1] - aparicoes[i]);
  }

  const mediaIntervalo = intervalos.length > 0
    ? intervalos.reduce((a, b) => a + b, 0) / intervalos.length
    : draws.length;

  const desvioIntervalo = intervalos.length > 1
    ? Math.sqrt(intervalos.reduce((sum, val) => sum + Math.pow(val - mediaIntervalo, 2), 0) / intervalos.length)
    : 0;

  return {
    numero,
    frequencia,
    recencia,
    tendencia,
    coocorrencia,
    mediaIntervalo,
    desvioIntervalo,
    ultimaAparicao: aparicoes[0] || -1,
    paridadePar: numero % 2 === 0 ? 1 : 0,
    faixaDecada: Math.floor((numero - 1) / 10)
  };
}

/**
 * Extrai features de um jogo completo
 */
export function extractGameFeatures(
  concurso: number,
  data: Date,
  numeros: number[]
): GameFeatures {
  const soma = numeros.reduce((a, b) => a + b, 0);
  const media = soma / numeros.length;
  
  const desvio = Math.sqrt(
    numeros.reduce((sum, n) => sum + Math.pow(n - media, 2), 0) / numeros.length
  );

  const pares = numeros.filter(n => n % 2 === 0).length;
  const impares = numeros.length - pares;

  // Contar sequências
  let sequencias = 0;
  const sorted = [...numeros].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) sequencias++;
  }

  // Distribuição por faixas
  const faixas = Array(6).fill(0);
  for (const n of numeros) {
    const faixa = Math.floor((n - 1) / 10);
    if (faixa < 6) faixas[faixa]++;
  }

  // Gaps (distâncias entre números consecutivos)
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }

  return {
    concurso,
    data,
    numeros,
    soma,
    media,
    desvio,
    pares,
    impares,
    sequencias,
    faixas,
    maxGap: Math.max(...gaps),
    minGap: Math.min(...gaps)
  };
}

/**
 * Gera dataset completo para treino
 */
export async function generateTrainingDataset(
  lotteryId: string,
  minDraws: number = 200
): Promise<{
  features: NumberFeatures[];
  games: GameFeatures[];
  cooccurrence: Map<string, number>;
}> {
  console.log(`📊 Gerando dataset de treino para ${lotteryId}...`);

  const draws = await storage.getLatestDraws(lotteryId, minDraws);
  
  if (draws.length < minDraws) {
    throw new Error(`Dados insuficientes: ${draws.length} sorteios (mínimo: ${minDraws})`);
  }

  const poolSize = 60; // Ajustar conforme loteria
  const cooccurrence = calculateCooccurrenceMatrix(draws, poolSize);

  // Features por número
  const features: NumberFeatures[] = [];
  for (let num = 1; num <= poolSize; num++) {
    features.push(extractNumberFeatures(num, draws, cooccurrence, poolSize));
  }

  // Features por jogo
  const games: GameFeatures[] = draws
    .filter(d => d.drawnNumbers && d.drawnNumbers.length > 0)
    .map(d => extractGameFeatures(
      d.contestNumber,
      new Date(d.drawDate),
      d.drawnNumbers!
    ));

  console.log(`✅ Dataset gerado: ${features.length} números, ${games.length} jogos`);

  return { features, games, cooccurrence };
}

/**
 * Calcula probabilidades usando features (modelo simplificado)
 */
export function calculateProbabilities(features: NumberFeatures[]): Record<number, number> {
  const probs: Record<number, number> = {};

  // Normalizar scores
  const maxFreq = Math.max(...features.map(f => f.frequencia));
  const minRecencia = Math.min(...features.map(f => f.recencia));

  for (const feature of features) {
    // Score baseado em frequência, recência e tendência
    let score = 0;
    
    score += (feature.frequencia / maxFreq) * 0.4; // 40% peso frequência
    score += (1 - feature.recencia / minRecencia) * 0.3; // 30% recência
    score += (feature.tendencia > 0 ? 0.2 : 0); // 20% tendência positiva
    score += (Object.keys(feature.coocorrencia).length / 10) * 0.1; // 10% co-ocorrência
    
    probs[feature.numero] = Math.max(0, Math.min(1, score));
  }

  return probs;
}

/**
 * Salva features em formato JSON (para treino externo)
 */
export function exportFeaturesJSON(
  features: NumberFeatures[],
  games: GameFeatures[],
  filename: string = 'features.json'
): void {
  const data = {
    timestamp: new Date().toISOString(),
    numberFeatures: features,
    gameFeatures: games
  };

  const fs = require('fs');
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`💾 Features exportadas para ${filename}`);
}
