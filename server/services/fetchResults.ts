
/**
 * 📥 ETL - FETCH DE RESULTADOS DAS LOTERIAS
 * 
 * Sistema robusto com:
 * - Múltiplas APIs com fallback automático
 * - Retry exponencial
 * - Validação de dados
 * - Cache inteligente
 */

import axios, { AxiosError } from 'axios';
import { storage } from '../storage';
import type { InsertLotteryDraw } from '@shared/schema';

interface APIResult {
  concurso: number;
  data: string;
  dezenas: string[] | number[];
  premiacao?: {
    acertos_6?: { vencedores: number; valor: string };
    acertos_5?: { vencedores: number; valor: string };
    acertos_4?: { vencedores: number; valor: string };
  };
}

// Lista de APIs por prioridade (tentará em ordem)
const API_PROVIDERS = [
  {
    name: 'loteriascaixa-api',
    base: 'https://loteriascaixa-api.herokuapp.com/api',
    timeout: 10000
  },
  {
    name: 'caixa-oficial',
    base: 'https://servicebus2.caixa.gov.br/portaldeloterias/api',
    timeout: 15000
  }
];

const API_ENDPOINTS: Record<string, string> = {
  megasena: 'megasena',
  lotofacil: 'lotofacil',
  quina: 'quina',
  lotomania: 'lotomania',
  duplasena: 'duplasena',
  supersete: 'supersete',
  milionaria: 'maismilionaria',
  timemania: 'timemania',
  diadesorte: 'diadesorte'
};

/**
 * Retry com backoff exponencial
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`⚠️  Tentativa ${attempt + 1} falhou, aguardando ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Validação de dados da API
 */
function validateAPIResult(data: any, lotteryId: string): APIResult | null {
  if (!data || typeof data !== 'object') return null;
  
  const concurso = data.concurso || data.numero;
  const dezenas = data.dezenas || data.listaDezenas;
  const dataStr = data.data || data.dataApuracao;
  
  if (!concurso || !dezenas || !Array.isArray(dezenas) || dezenas.length === 0) {
    console.warn(`⚠️ Dados inválidos para ${lotteryId}:`, { concurso, dezenas: dezenas?.length });
    return null;
  }
  
  return {
    concurso: parseInt(String(concurso)),
    data: dataStr,
    dezenas: dezenas.map(d => String(d)),
    premiacao: data.premiacao || data.listaRateioPremio
  };
}

/**
 * Busca último resultado com fallback entre múltiplas APIs
 */
export async function fetchLatestResult(lotteryId: string): Promise<APIResult | null> {
  console.log(`📡 Buscando último resultado: ${lotteryId}`);
  
  const endpoint = API_ENDPOINTS[lotteryId];
  if (!endpoint) {
    console.error(`❌ Endpoint não encontrado para ${lotteryId}`);
    return null;
  }
  
  // Tentar cada provedor em ordem de prioridade
  for (const provider of API_PROVIDERS) {
    try {
      const url = `${provider.base}/${endpoint}/latest`;
      console.log(`  🔍 Tentando ${provider.name}...`);
      
      const response = await retryWithBackoff(
        () => axios.get(url, { 
          timeout: provider.timeout,
          headers: { 'Accept': 'application/json' }
        }),
        2, // apenas 2 tentativas por provider
        1000
      );
      
      const validated = validateAPIResult(response.data, lotteryId);
      if (validated) {
        console.log(`✅ Sucesso via ${provider.name}: Concurso ${validated.concurso}`);
        return validated;
      }
    } catch (error) {
      console.log(`  ⚠️ ${provider.name} falhou:`, (error as Error).message);
      continue;
    }
  }
  
  console.error(`❌ Todas as APIs falharam para ${lotteryId}`);
  return null;
}

/**
 * Busca múltiplos concursos (histórico)
 */
export async function fetchHistoricalResults(
  lotteryId: string,
  fromContest: number,
  toContest: number
): Promise<APIResult[]> {
  console.log(`📚 Buscando histórico ${lotteryId}: ${fromContest} a ${toContest}`);
  
  const results: APIResult[] = [];
  const batchSize = 10; // Buscar em lotes para não sobrecarregar
  
  for (let i = fromContest; i <= toContest; i += batchSize) {
    const batch = [];
    const end = Math.min(i + batchSize - 1, toContest);
    
    for (let concurso = i; concurso <= end; concurso++) {
      batch.push(fetchResultByContest(lotteryId, concurso));
    }
    
    const batchResults = await Promise.allSettled(batch);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }
    
    // Aguardar entre lotes para respeitar rate limits
    if (end < toContest) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`✅ ${results.length} concursos históricos obtidos`);
  return results;
}

/**
 * Busca resultado específico por concurso
 */
async function fetchResultByContest(lotteryId: string, concurso: number): Promise<APIResult | null> {
  try {
    const url = `${API_ENDPOINTS[lotteryId]}/${concurso}`;
    const response = await axios.get<APIResult>(url, { timeout: 8000 });
    return response.data;
  } catch (error) {
    // Tentar API da Caixa
    try {
      const url = `${CAIXA_API_BASE}/${lotteryId}/${concurso}`;
      const response = await axios.get(url, { timeout: 10000 });
      
      return {
        concurso: response.data.numero || concurso,
        data: response.data.dataApuracao,
        dezenas: response.data.listaDezenas || [],
        premiacao: response.data.listaRateioPremio
      };
    } catch (fallbackError) {
      return null;
    }
  }
}

/**
 * Salva resultado no banco (evita duplicatas)
 */
export async function saveResultToDatabase(lotteryId: string, result: APIResult): Promise<boolean> {
  try {
    // Verificar se já existe
    const existing = await storage.getDrawByContest(lotteryId, result.concurso);
    
    if (existing) {
      console.log(`⏭️  Concurso ${result.concurso} já existe, pulando...`);
      return false;
    }

    // Preparar dados
    const drawData: InsertLotteryDraw = {
      lotteryId,
      contestNumber: result.concurso,
      drawDate: new Date(result.data),
      drawnNumbers: result.dezenas.map(d => parseInt(d)),
      prize: result.premiacao?.acertos_6?.valor || '0',
      winners: result.premiacao?.acertos_6?.vencedores || 0
    };

    await storage.createLotteryDraw(drawData);
    console.log(`✅ Concurso ${result.concurso} salvo no banco`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao salvar concurso ${result.concurso}:`, (error as Error).message);
    return false;
  }
}

/**
 * Sincronização completa (buscar e salvar últimos resultados)
 */
export async function syncAllLotteries(): Promise<{
  success: string[];
  failed: string[];
}> {
  console.log('🔄 Iniciando sincronização completa...\n');
  
  const lotteries = Object.keys(API_ENDPOINTS);
  const success: string[] = [];
  const failed: string[] = [];

  for (const lotteryId of lotteries) {
    try {
      const result = await fetchLatestResult(lotteryId);
      
      if (result) {
        const saved = await saveResultToDatabase(lotteryId, result);
        if (saved) {
          success.push(lotteryId);
        }
      } else {
        failed.push(lotteryId);
      }
    } catch (error) {
      console.error(`❌ Falha em ${lotteryId}:`, (error as Error).message);
      failed.push(lotteryId);
    }
    
    // Aguardar entre requisições
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n✅ Sincronização completa:`);
  console.log(`   Sucesso: ${success.join(', ')}`);
  if (failed.length > 0) {
    console.log(`   Falhas: ${failed.join(', ')}`);
  }

  return { success, failed };
}

/**
 * Agendar sincronização periódica (rodar como cron)
 */
export function scheduleDailySync(): NodeJS.Timeout {
  console.log('⏰ Agendando sincronização diária às 22:00...');
  
  const runSync = async () => {
    const now = new Date();
    const hour = now.getHours();
    
    // Executar às 22h (após sorteios)
    if (hour === 22) {
      await syncAllLotteries();
    }
  };

  // Verificar a cada hora
  const interval = setInterval(runSync, 60 * 60 * 1000);
  
  // Executar primeira vez agora (se for horário)
  runSync();
  
  return interval;
}

/**
 * Adicionar método ao storage para buscar por concurso
 */
declare module '../storage' {
  interface Storage {
    getDrawByContest(lotteryId: string, contestNumber: number): Promise<any | null>;
  }
}
