import { storage } from "../storage";

interface BettingPlatform {
  id: string;
  name: string;
  baseUrl: string;
  cartEndpoint: string;
  authRequired: boolean;
  supportedLotteries: string[];
}

interface CartItem {
  lotteryId: string;
  numbers: number[];
  contestNumber?: number;
}

// Plataformas suportadas
const PLATFORMS: Record<string, BettingPlatform> = {
  superjogo: {
    id: 'superjogo',
    name: 'Lotogiro',
    baseUrl: 'https://superjogo.loteriabr.com',
    cartEndpoint: '/carrinho/adicionar',
    authRequired: false,
    supportedLotteries: ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena']
  },
  caixa: {
    id: 'caixa',
    name: 'Loterias Caixa',
    baseUrl: 'https://www.loteriasonline.caixa.gov.br',
    cartEndpoint: '/silce/carrinho',
    authRequired: true,
    supportedLotteries: ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'supersete', 'milionaria', 'timemania', 'diadesorte']
  },
  lottoland: {
    id: 'lottoland',
    name: 'Lottoland',
    baseUrl: 'https://www.lottoland.com/pt',
    cartEndpoint: '/cart/add',
    authRequired: false,
    supportedLotteries: ['megasena', 'lotofacil']
  }
};

class BettingPlatformService {

  // Gera URL para adicionar ao carrinho
  generateCartUrl(platformId: string, items: CartItem[]): string {
    if (!platformId) {
      throw new Error('ID da plataforma não fornecido');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Lista de jogos inválida ou vazia');
    }

    const platform = PLATFORMS[platformId];
    if (!platform) {
      throw new Error(`Plataforma ${platformId} não suportada`);
    }

    // Validar que todos os jogos têm números
    const invalidItems = items.filter(item => !item.numbers || item.numbers.length === 0);
    if (invalidItems.length > 0) {
      throw new Error('Um ou mais jogos não possuem números válidos');
    }

    try {
      // Lotogiro - formato específico
      if (platformId === 'superjogo') {
        return this.generateSuperJogoUrl(items);
      }

      // Caixa - formato específico
      if (platformId === 'caixa') {
        return this.generateCaixaUrl(items);
      }

      // Lottoland - formato específico
      if (platformId === 'lottoland') {
        return this.generateLottolandUrl(items);
      }

      // Formato genérico para outras plataformas
      return this.generateGenericUrl(platform, items);
    } catch (error) {
      console.error('Erro ao gerar URL do carrinho:', error);
      throw new Error('Falha ao processar números dos jogos');
    }
  }

  private generateSuperJogoUrl(items: CartItem[]): string {
    const baseUrl = PLATFORMS.superjogo.baseUrl;

    // Lotogiro permite múltiplos jogos na URL
    const gamesParam = items.map(item => {
      const lottery = this.mapLotteryId(item.lotteryId, 'superjogo');
      const numbers = item.numbers.sort((a, b) => a - b).join(',');
      return `${lottery}:${numbers}`;
    }).join('|');

    return `${baseUrl}/carrinho?jogos=${encodeURIComponent(gamesParam)}`;
  }

  private generateCaixaUrl(items: CartItem[]): string {
    const baseUrl = PLATFORMS.caixa.baseUrl;

    // Caixa requer autenticação e adiciona um jogo por vez
    // Retorna URL para login + redirecionamento
    const firstItem = items[0];
    const lottery = this.mapLotteryId(firstItem.lotteryId, 'caixa');
    const numbers = firstItem.numbers.sort((a, b) => a - b).join('-');

    return `${baseUrl}/login?redirect=/apostar/${lottery}?numeros=${numbers}`;
  }

  private generateLottolandUrl(items: CartItem[]): string {
    const baseUrl = PLATFORMS.lottoland.baseUrl;
    const firstItem = items[0];
    const lottery = this.mapLotteryId(firstItem.lotteryId, 'lottoland');
    const numbers = firstItem.numbers.sort((a, b) => a - b).join(',');

    return `${baseUrl}/megasena/jogar?numbers=${numbers}`;
  }

  private generateGenericUrl(platform: BettingPlatform, items: CartItem[]): string {
    const params = new URLSearchParams();
    items.forEach((item, index) => {
      params.append(`game${index}`, JSON.stringify({
        lottery: item.lotteryId,
        numbers: item.numbers
      }));
    });

    return `${platform.baseUrl}${platform.cartEndpoint}?${params.toString()}`;
  }

  // Mapeia IDs internos para IDs da plataforma
  private mapLotteryId(internalId: string, platformId: string): string {
    const mappings: Record<string, Record<string, string>> = {
      superjogo: {
        'megasena': 'mega-sena',
        'lotofacil': 'lotofacil',
        'quina': 'quina',
        'lotomania': 'lotomania',
        'duplasena': 'dupla-sena',
        'diadesorte': 'dia-de-sorte',
        'supersete': 'super-sete',
        'milionaria': 'mais-milionaria',
        'timemania': 'timemania'
      },
      caixa: {
        'megasena': 'mega-sena',
        'lotofacil': 'lotofacil',
        'quina': 'quina',
        'lotomania': 'lotomania',
        'duplasena': 'dupla-sena',
        'diadesorte': 'dia-de-sorte',
        'supersete': 'super-sete',
        'milionaria': '+milionaria',
        'timemania': 'timemania'
      },
      lottoland: {
        'megasena': 'megasena-brazil',
        'lotofacil': 'lotofacil-brazil'
      }
    };

    return mappings[platformId]?.[internalId] || internalId;
  }

  // Lista plataformas disponíveis para uma loteria
  getAvailablePlatforms(lotteryId: string): BettingPlatform[] {
    return Object.values(PLATFORMS).filter(
      platform => platform.supportedLotteries.includes(lotteryId)
    );
  }

  // Verifica se uma plataforma suporta determinada loteria
  isPlatformSupported(platformId: string, lotteryId: string): boolean {
    const platform = PLATFORMS[platformId];
    return platform ? platform.supportedLotteries.includes(lotteryId) : false;
  }

  // Gera deeplink para app móvel (se disponível)
  generateDeepLink(platformId: string, items: CartItem[]): string | null {
    const deeplinks: Record<string, string> = {
      'caixa': 'loteriasonline://cart',
      'superjogo': 'lotogiro://cart'
    };

    return deeplinks[platformId] || null;
  }
}

export const bettingPlatformService = new BettingPlatformService();