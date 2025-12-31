import { storage } from "../storage";
import { aiService } from "./aiService";
import type { LotteryType, InsertLotteryDraw, InsertUserGame, NextDrawInfo } from "@shared/schema";
import { LOTTERY_CONFIGS, API_ENDPOINTS, DATE_FORMATS, getLotteryConfig, getAllLotteryConfigs } from "@shared/lotteryConstants";
import { DataValidator, DataFormatter, AnomalyDetector } from "@shared/dataValidation";

interface GenerateGamesParams {
  lotteryId: string;
  numbersCount: number;
  gamesCount: number;
  strategy: 'hot' | 'cold' | 'mixed' | 'ai';
  userId: string;
}


class LotteryService {
  private readonly API_BASE = API_ENDPOINTS.CAIXA_BASE;
  private readonly LOTERIAS_CAIXA_API = API_ENDPOINTS.FALLBACK_BASE;
  private initializationPromise: Promise<void> | null = null;

  async initializeLotteryTypes(): Promise<void> {
    // Return existing promise if initialization is already in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  private async _performInitialization(): Promise<void> {
    try {
      console.log('🔧 Ensuring all lottery types are properly initialized...');

      // 🎯 FASE 1: Usando configurações centralizadas das loterias
      const defaultLotteries = getAllLotteryConfigs().map(config => ({
        id: config.id,
        name: config.name,
        displayName: config.displayName,
        minNumbers: config.minNumbers,
        maxNumbers: config.maxNumbers,
        totalNumbers: config.totalNumbers,
        drawDays: config.drawDays,
        drawTime: config.drawTime,
        isActive: config.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Insert lottery types into the database with retry logic
      for (const lottery of defaultLotteries) {
        let retries = 3;
        while (retries > 0) {
          try {
            await storage.insertLotteryType(lottery);
            console.log(`✓ Inserted lottery type: ${lottery.displayName}`);
            break;
          } catch (error) {
            retries--;
            if (retries === 0) {
              console.log(`Failed to insert lottery type ${lottery.id} after retries`);
            } else {
              console.log(`Retry ${4 - retries} for lottery type ${lottery.id}`);
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            }
          }
        }
      }

      // Verify initialization
      const finalCheck = await storage.getLotteryTypes();
      console.log(`✓ Lottery initialization complete. Found ${finalCheck.length} types.`);
    } catch (error) {
      console.error('Error initializing lottery types:', error);
      // Reset the promise so it can be retried
      this.initializationPromise = null;
      throw error;
    }
  }

  async getNextDrawInfo(lotteryId: string): Promise<NextDrawInfo | null> {
    try {
      // Try to fetch real data from Loterias Caixa API first
      const realData = await this.fetchRealLotteryData(lotteryId);
      if (realData) {
        return realData;
      }

      // Fallback to calculated data
      const lottery = await storage.getLotteryType(lotteryId);
      if (!lottery || !lottery.drawDays) {
        return null;
      }

      const now = new Date();
      const nextDrawDate = this.calculateNextDrawDate(lottery.drawDays, lottery.drawTime || '20:00'); // Use lottery-specific time
      const timeDiff = nextDrawDate.getTime() - now.getTime();

      // Ensure time difference is never negative
      const positiveTimeDiff = Math.max(0, timeDiff);

      const days = Math.floor(positiveTimeDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((positiveTimeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((positiveTimeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((positiveTimeDiff % (1000 * 60)) / 1000);

      // Estimate contest number and prize (in real app, fetch from API)
      const latestDraws = await storage.getLatestDraws(lotteryId, 1);
      const nextContestNumber = latestDraws.length > 0 ? latestDraws[0].contestNumber + 1 : 1;
      return {
        contestNumber: nextContestNumber,
        drawDate: nextDrawDate.toISOString(),
        drawTime: lottery.drawTime || '20:00',
        timeRemaining: { 
          days: Math.max(0, days), 
          hours: Math.max(0, hours), 
          minutes: Math.max(0, minutes), 
          seconds: Math.max(0, seconds) 
        },
        estimatedPrize: this.getEstimatedPrize(lotteryId),
      };
    } catch (error) {
      console.error('Error getting next draw info:', error);
      return null;
    }
  }

  private calculateNextDrawDate(drawDays: string[], drawTime: string): Date {
    // Always use Brasília timezone (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60; // UTC-3 in minutes
    const localOffset = now.getTimezoneOffset();
    const brasiliaTime = new Date(now.getTime() + (localOffset - brasiliaOffset) * 60000);

    const today = brasiliaTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // Map day names to numbers - support both English and Portuguese
    const dayMap: Record<string, number> = {
      // Portuguese
      'domingo': 0,
      'segunda': 1, 'segunda-feira': 1,
      'terça': 2, 'terca': 2, 'terça-feira': 2, 'terca-feira': 2,
      'quarta': 3, 'quarta-feira': 3,
      'quinta': 4, 'quinta-feira': 4,
      'sexta': 5, 'sexta-feira': 5,
      'sábado': 6, 'sabado': 6,
      // English (for compatibility)
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6
    };

    // Convert draw days to numbers
    const drawDayNumbers = drawDays.map(day => dayMap[day.toLowerCase()]).filter((d): d is number => d !== undefined);

    if (drawDayNumbers.length === 0) {
      // Default to tomorrow at draw time if no valid draw days
      const [fallbackHour, fallbackMinute] = drawTime.split(':').map(Number);
      const nextDay = new Date(brasiliaTime);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(fallbackHour, fallbackMinute, 0, 0);
      // Convert to UTC for return
      return new Date(nextDay.getTime() - (localOffset - brasiliaOffset) * 60000);
    }

    // Sort draw days
    const sortedDrawDays = [...drawDayNumbers].sort((a, b) => a - b);
    let nextDrawDay: number;
    let daysToAdd = 0;

    // Parse draw time (format: "HH:MM")
    const [drawHour, drawMinute] = drawTime.split(':').map(Number);

    // Check if today is a draw day and if we're before draw time Brasília time
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const isBeforeDrawTime = currentHour < drawHour || (currentHour === drawHour && currentMinute < drawMinute);

    if (sortedDrawDays.includes(today) && isBeforeDrawTime) {
      // Today is a draw day and we're before draw time
      nextDrawDay = today;
      daysToAdd = 0;
    } else {
      // Find next draw day after today
      nextDrawDay = sortedDrawDays.find(day => day > today) ?? sortedDrawDays[0];

      if (nextDrawDay === undefined) {
        // Next draw is next week (first day of next week)
        nextDrawDay = sortedDrawDays[0];
        daysToAdd = (7 - today) + nextDrawDay;
      } else {
        daysToAdd = nextDrawDay - today;
      }
    }

    // Create the next draw date in Brasília timezone
    const nextDraw = new Date(brasiliaTime);
    nextDraw.setDate(brasiliaTime.getDate() + daysToAdd);
    nextDraw.setHours(drawHour, drawMinute, 0, 0); // Use lottery-specific draw time

    // Convert to UTC for return
    const utcNextDraw = new Date(nextDraw.getTime() - (localOffset - brasiliaOffset) * 60000);

    return utcNextDraw;
  }

  async fetchRealLotteryData(lotteryId: string): Promise<NextDrawInfo | null> {
    try {
      // Map internal lottery IDs to official Caixa API contest IDs
      const lotteryMapping: Record<string, string> = {
        'megasena': 'megasena',
        'lotofacil': 'lotofacil',
        'quina': 'quina',
        'lotomania': 'lotomania',
        'duplasena': 'duplasena',
        'supersete': 'supersete',
        'milionaria': 'maismilionaria',
        'timemania': 'timemania',
        'diadesore': 'diadesorte',
        'loteca': 'loteca'
      };

      const officialId = lotteryMapping[lotteryId];
      if (!officialId) return null;

      // Try multiple official endpoints for better reliability (including free Guidi API)
      const apiUrls = [
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/${officialId}/`,
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/${officialId}`,
        `https://api.guidi.dev.br/loteria/${officialId}/ultimo`, // 🆕 API Guidi gratuita como backup
        `https://api.loterias.caixa.gov.br/${officialId}/latest`
      ];

      let response;
      let data;

      for (const url of apiUrls) {
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (compatible; SharkLoto/1.0)'
            }
          });

          if (response.ok) {
            data = await response.json();
            if (data && data.numero) {
              console.log(`✓ Successfully fetched ${lotteryId} data from ${url}`);
              break;
            }
          }
        } catch (urlError) {
          console.log(`Failed to fetch from ${url}:`, urlError instanceof Error ? urlError.message : String(urlError));
          continue;
        }
      }

      // If no API worked, return null
      if (!data || !data.numero) {
        console.log(`Failed to fetch ${lotteryId} data from official API`);
        return null;
      }

      if (data && data.numero) {
        // Get official draw schedule from Caixa data
        const lottery = await storage.getLotteryType(lotteryId);

        // Use official next draw date from API if available
        let nextDrawDate: Date;
        if (data.dataProximoConcurso) {
          // Handle different date formats from API
          let dateStr = data.dataProximoConcurso;
          if (typeof dateStr === 'string') {
            // Convert DD/MM/YYYY to YYYY-MM-DD format for proper parsing
            if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              }
            }
            nextDrawDate = new Date(dateStr + 'T20:00:00-03:00'); // Always 20:00 Brasília time
          } else {
            nextDrawDate = new Date(data.dataProximoConcurso);
          }

          // Validate the date
          if (isNaN(nextDrawDate.getTime())) {
            console.log(`Invalid date format for ${lotteryId}, using calculated date`);
            nextDrawDate = lottery ? this.calculateNextDrawDate(lottery.drawDays || [], lottery.drawTime || '20:00') : new Date();
          } else {
            console.log(`✓ Using official next draw date for ${lotteryId}: ${nextDrawDate.toISOString()}`);
          }
        } else {
          // Fallback to calculated date
          nextDrawDate = lottery ? this.calculateNextDrawDate(lottery.drawDays || [], '20:00') : new Date();
        }

        // Calculate real-time countdown in Brasília timezone
        const now = new Date();
        const brasiliaOffset = -3 * 60; // UTC-3 in minutes
        const localOffset = now.getTimezoneOffset();
        const brasiliaTime = new Date(now.getTime() + (localOffset - brasiliaOffset) * 60000);

        // Ensure nextDrawDate is in UTC for proper calculation
        const nextDrawUTC = new Date(nextDrawDate.getTime());
        const timeDiff = nextDrawUTC.getTime() - now.getTime();

        // Ensure positive time difference
        const positiveTimeDiff = Math.max(0, timeDiff);

        const days = Math.floor(positiveTimeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((positiveTimeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((positiveTimeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((positiveTimeDiff % (1000 * 60)) / 1000);

        // Store the latest draw in database for analysis (with proper date validation)
        let validDrawDate = new Date();
        if (data.dataApuracao) {
          let dateStr = data.dataApuracao;
          if (typeof dateStr === 'string' && dateStr.includes('/')) {
            // Convert DD/MM/YYYY to YYYY-MM-DD format
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          const testDate = new Date(dateStr);
          if (!isNaN(testDate.getTime())) {
            validDrawDate = testDate;
          }
        } else if (data.dataProximoConcurso) {
          let dateStr = data.dataProximoConcurso;
          if (typeof dateStr === 'string' && dateStr.includes('/')) {
            // Convert DD/MM/YYYY to YYYY-MM-DD format
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          const testDate = new Date(dateStr);
          if (!isNaN(testDate.getTime())) {
            validDrawDate = testDate;
          }
        }

        const drawData = {
          lotteryId,
          contestNumber: data.numero,
          drawDate: validDrawDate,
          drawnNumbers: data.listaDezenas || data.dezenas || [],
          prizes: data.listaRateioPremio || []
        };

        try {
          await storage.createLotteryDraw(drawData);
        } catch (dbError) {
          console.log('Could not save draw data to database:', dbError);
        }

        // Format prize value properly with real-time data from official API
        let formattedPrize = this.getEstimatedPrize(lotteryId);

        // Try multiple prize fields from the API response
        const prizeFields = [
          'valorEstimadoProximoConcurso',
          'valorAcumuladoProximoConcurso', 
          'valorAcumuladoConcurso',
          'valorEstimado',
          'proximoConcurso'
        ];

        for (const field of prizeFields) {
          if (data[field]) {
            let prizeValue;
            if (typeof data[field] === 'number') {
              prizeValue = data[field];
            } else if (typeof data[field] === 'string') {
              prizeValue = parseFloat(data[field].toString().replace(/[^\d.,]/g, '').replace(',', '.'));
            }

            if (!isNaN(prizeValue) && prizeValue > 0) {
              formattedPrize = `R$ ${prizeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
              console.log(`✓ Updated ${lotteryId} prize from API: ${formattedPrize}`);
              break;
            }
          }
        }

        // Use official contest number from API
        const nextContestNumber = data.proximoConcurso || (data.numero + 1);

        return {
          contestNumber: nextContestNumber,
          drawDate: nextDrawDate.toISOString(),
          drawTime: lottery?.drawTime || '20:00',
          timeRemaining: { 
            days: Math.max(0, days), 
            hours: Math.max(0, hours), 
            minutes: Math.max(0, minutes), 
            seconds: Math.max(0, seconds) 
          },
          estimatedPrize: formattedPrize
        };
      }

      return null;
    } catch (error) {
      console.error(`Error fetching real data for ${lotteryId}:`, error);
      return null;
    }
  }

  private getEstimatedPrize(lotteryId: string): string {
    // Updated realistic prize estimates based on current official data
    const prizesMap: Record<string, string> = {
      'megasena': 'R$ 70.000.000,00',
      'lotofacil': 'R$ 1.700.000,00',
      'quina': 'R$ 1.300.000,00',
      'lotomania': 'R$ 4.000.000,00',
      'duplasena': 'R$ 1.200.000,00',
      'supersete': 'R$ 4.500.000,00',
      'milionaria': 'R$ 25.000.000,00',
      'timemania': 'R$ 3.200.000,00',
      'diadesore': 'R$ 1.800.000,00',
      'loteca': 'R$ 900.000,00'
    };
    return prizesMap[lotteryId] || 'R$ 1.000.000,00';
  }

  async generateGames(params: GenerateGamesParams): Promise<InsertUserGame[]> {
    try {
      const lottery = await storage.getLotteryType(params.lotteryId);
      if (!lottery) {
        throw new Error('Lottery type not found');
      }

      const nextDraw = await this.getNextDrawInfo(params.lotteryId);
      if (!nextDraw) {
        throw new Error('Unable to get next draw information');
      }

      // Ensure we're not generating for already drawn contests
      const latestDraws = await storage.getLatestDraws(params.lotteryId, 1);
      if (latestDraws.length > 0 && nextDraw.contestNumber <= latestDraws[0].contestNumber) {
        throw new Error('Cannot generate games for already drawn contests');
      }

      const games: InsertUserGame[] = [];

      // Generate games based on strategy
      for (let i = 0; i < params.gamesCount; i++) {
        let selectedNumbers: number[];

        if (params.strategy === 'ai') {
          // Passar índice único para cada jogo
          selectedNumbers = await this.generateAINumbers(params.lotteryId, params.numbersCount, lottery.totalNumbers, i);
        } else {
          selectedNumbers = await this.generateNumbers(params.lotteryId, params.numbersCount, params.strategy, lottery, i);
        }

        const game: InsertUserGame = {
          userId: params.userId,
          lotteryId: params.lotteryId,
          selectedNumbers: selectedNumbers.sort((a, b) => a - b),
          contestNumber: nextDraw.contestNumber,
          strategy: params.strategy,
          matches: 0, // Will be updated when draw results are available
          prizeWon: "0.00", // Will be updated when draw results are available
        };

        games.push(game);

        // Save to database
        await storage.createUserGame(game);
      }

      return games;
    } catch (error) {
      console.error('Error generating games:', error);
      throw new Error('Failed to generate games: ' + error.message);
    }
  }

  private async generateNumbers(lotteryId: string, count: number, strategy: 'hot' | 'cold' | 'mixed', config: any, gameIndex: number = 0): Promise<number[]> {
    try {
      const frequencies = await storage.getNumberFrequencies(lotteryId);
      const latestDraws = await storage.getLatestDraws(lotteryId, 50);

      if (frequencies.length === 0) {
        console.log(`No frequency data for ${lotteryId}, using intelligent random generation`);
        return this.generateIntelligentRandomNumbers(count, config.totalNumbers, lotteryId);
      }

      // Análise estatística avançada
      const statisticalAnalysis = this.performStatisticalAnalysis(frequencies, latestDraws, config.totalNumbers);
      const patternAnalysis = this.analyzeNumberPatterns(latestDraws, config.totalNumbers);
      const cyclicalAnalysis = this.analyzeCyclicalTrends(latestDraws, config.totalNumbers);

      let numbers: number[] = [];

      switch (strategy) {
        case 'hot':
          // Select from hot numbers com variação baseada no gameIndex
          const selectedHot = this.selectRandom(statisticalAnalysis.hot.map((f: any) => f.number), count, gameIndex);
          numbers.push(...selectedHot);
          break;

        case 'cold':
          // Select from cold numbers com variação baseada no gameIndex
          const selectedCold = this.selectRandom(statisticalAnalysis.cold.map((f: any) => f.number), count, gameIndex);
          numbers.push(...selectedCold);
          break;

        case 'mixed':
        default:
          // Mix hot, warm, and cold numbers (40% hot, 35% warm, 25% cold)
          const hotCount = Math.floor(count * 0.40);
          const warmCount = Math.floor(count * 0.35);
          const coldCount = count - hotCount - warmCount;

          const mixedHot = this.selectRandom(statisticalAnalysis.hot.map((f: any) => f.number), hotCount, gameIndex);
          const mixedWarm = this.selectRandom(statisticalAnalysis.warm.map((f: any) => f.number), warmCount, gameIndex + 1);
          const mixedCold = this.selectRandom(statisticalAnalysis.cold.map((f: any) => f.number), coldCount, gameIndex + 2);

          numbers.push(...mixedHot, ...mixedWarm, ...mixedCold);
          break;
      }

      // Aplicar filtros anti-padrões impossíveis
      numbers = this.applyIntelligentFilters(numbers, latestDraws, config.totalNumbers, lotteryId);

      // Verificação de qualidade final
      numbers = this.validateNumberQuality(numbers, statisticalAnalysis, count, config.totalNumbers);

      return numbers.sort((a, b) => a - b);
    } catch (error) {
      console.error('Error generating strategy numbers:', error);
      return this.generateIntelligentRandomNumbers(count, config.totalNumbers, lotteryId);
    }
  }

  private performStatisticalAnalysis(frequencies: any[], latestDraws: any[], maxNumber: number) {
    // Análise de frequência ponderada por tempo
    const weightedFrequencies = frequencies.map(f => {
      const recency = f.drawsSinceLastSeen || 0;
      const weight = Math.exp(-recency / 10); // Peso decai exponencialmente
      return {
        ...f,
        weightedFrequency: f.frequency * weight,
        probabilityScore: this.calculateProbabilityScore(f, recency)
      };
    });

    // Classificação inteligente de temperatura
    const sortedByWeight = [...weightedFrequencies].sort((a, b) => b.weightedFrequency - a.weightedFrequency);
    const hotThreshold = Math.ceil(maxNumber * 0.25);
    const warmThreshold = Math.ceil(maxNumber * 0.50);

    const hot = sortedByWeight.slice(0, hotThreshold);
    const warm = sortedByWeight.slice(hotThreshold, warmThreshold);
    const cold = sortedByWeight.slice(warmThreshold);

    return { hot, warm, cold, weightedFrequencies };
  }

  private calculateProbabilityScore(frequency: any, recency: number): number {
    // Algoritmo que considera múltiplos fatores
    const frequencyScore = frequency.frequency / 100;
    const recencyScore = Math.max(0, 1 - recency / 20);
    const balanceScore = this.calculateBalanceScore(frequency.number);

    return (frequencyScore * 0.4) + (recencyScore * 0.3) + (balanceScore * 0.3);
  }

  private calculateBalanceScore(number: number): number {
    // Evita padrões óbvios como todos pares, todos ímpares, sequenciais
    const isEven = number % 2 === 0 ? 1 : 0;
    const digitSum = number.toString().split('').reduce((sum, digit) => sum + parseInt(digit), 0);
    const isSequential = this.isSequentialNumber(number);

    return (isEven * 0.3) + (digitSum / 20) + (isSequential ? -0.2 : 0.2);
  }

  private isSequentialNumber(number: number): boolean {
    // Verifica se faz parte de sequências óbvias
    const sequences = [[1,2,3,4,5], [10,11,12,13,14], [20,21,22,23,24], [30,31,32,33,34]];
    return sequences.some(seq => seq.includes(number));
  }

  private analyzeNumberPatterns(latestDraws: any[], maxNumber: number) {
    const recentNumbers = new Set<number>();
    const numberPairs = new Map<string, number>();
    const numberGroups = new Map<number, number>();

    // Análise dos últimos 10 sorteios
    latestDraws.slice(0, 10).forEach(draw => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => recentNumbers.add(num));

        // Análise de pares frequentes
        for (let i = 0; i < draw.drawnNumbers.length - 1; i++) {
          for (let j = i + 1; j < draw.drawnNumbers.length; j++) {
            const pair = `${Math.min(draw.drawnNumbers[i], draw.drawnNumbers[j])}-${Math.max(draw.drawnNumbers[i], draw.drawnNumbers[j])}`;
            numberPairs.set(pair, (numberPairs.get(pair) || 0) + 1);
          }
        }

        // Análise de grupos (dezenas, unidades)
        draw.drawnNumbers.forEach((num: number) => {
          const group = Math.floor(num / 10);
          numberGroups.set(group, (numberGroups.get(group) || 0) + 1);
        });
      }
    });

    return {
      recentNumbers: Array.from(recentNumbers),
      frequentPairs: Array.from(numberPairs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20),
      groupDistribution: numberGroups,
      avoidRecent: recentNumbers.size > 15 // Se muitos números saíram recentemente, evitar
    };
  }

  private analyzeCyclicalTrends(latestDraws: any[], maxNumber: number) {
    const cycles = new Map<number, number[]>();

    // Analisa ciclos de aparição de números
    latestDraws.forEach((draw, index) => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => {
          if (!cycles.has(num)) cycles.set(num, []);
          cycles.get(num)!.push(index);
        });
      }
    });

    const cyclicalScores = new Map<number, number>();
    cycles.forEach((positions, number) => {
      if (positions.length > 1) {
        // Calcula intervalos entre aparições
        const intervals = positions.slice(1).map((pos, i) => pos - positions[i]);
        const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
        const consistency = 1 / (Math.abs(avgInterval - 8) + 1); // Intervalos próximos de 8 são mais consistentes
        cyclicalScores.set(number, consistency);
      }
    });

    return { cyclicalScores, cycles };
  }

  private async generateHotStrategy(statistical: any, patterns: any, count: number, maxNumber: number): Promise<number[]> {
    const candidates = statistical.hot
      .filter((item: any) => !patterns.recentNumbers.includes(item.number) || Math.random() > 0.7)
      .sort((a: any, b: any) => b.probabilityScore - a.probabilityScore)
      .map((item: any) => item.number);

    return this.selectIntelligentNumbers(candidates, count, maxNumber, 'hot');
  }

  private async generateColdStrategy(statistical: any, cyclical: any, count: number, maxNumber: number): Promise<number[]> {
    const candidates = statistical.cold
      .map((item: any) => ({
        ...item,
        cyclicalScore: cyclical.cyclicalScores.get(item.number) || 0
      }))
      .sort((a: any, b: any) => (b.probabilityScore + b.cyclicalScore) - (a.probabilityScore + a.cyclicalScore))
      .map((item: any) => item.number);

    return this.selectIntelligentNumbers(candidates, count, maxNumber, 'cold');
  }

  private async generateMixedStrategy(statistical: any, patterns: any, cyclical: any, count: number, maxNumber: number): Promise<number[]> {
    const hotCount = Math.ceil(count * 0.35);
    const warmCount = Math.ceil(count * 0.35);
    const coldCount = count - hotCount - warmCount;

    const hotNumbers = await this.generateHotStrategy(statistical, patterns, hotCount, maxNumber);
    const warmNumbers = statistical.warm.slice(0, warmCount).map((item: any) => item.number);
    const coldNumbers = await this.generateColdStrategy(statistical, cyclical, coldCount, maxNumber);

    const combined = [...hotNumbers, ...warmNumbers, ...coldNumbers];
    return this.selectIntelligentNumbers(combined, count, maxNumber, 'mixed');
  }

  private selectIntelligentNumbers(candidates: number[], count: number, maxNumber: number, strategy: string): number[] {
    const selected: number[] = [];
    const used = new Set<number>();

    // Seleciona números evitando padrões óbvios
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      if (used.has(candidate)) continue;

      // Verifica se não cria padrões indesejados
      if (this.isValidAddition(selected, candidate, maxNumber)) {
        selected.push(candidate);
        used.add(candidate);
      }
    }

    // Completa com números inteligentes se necessário
    while (selected.length < count) {
      const remaining = Array.from({ length: maxNumber }, (_, i) => i + 1)
        .filter(n => !used.has(n));

      if (remaining.length === 0) break;

      const smartChoice = this.chooseSmartNumber(remaining, selected, maxNumber);
      if (smartChoice && !used.has(smartChoice)) {
        selected.push(smartChoice);
        used.add(smartChoice);
      } else if (remaining.length > 0) {
        const fallback = remaining[Math.floor(Math.random() * remaining.length)];
        selected.push(fallback);
        used.add(fallback);
      }
    }

    return selected;
  }

  private isValidAddition(selected: number[], candidate: number, maxNumber: number): boolean {
    if (selected.length === 0) return true;

    // Evita muitos números consecutivos
    const consecutiveCount = selected.filter(n => Math.abs(n - candidate) === 1).length;
    if (consecutiveCount > 2) return false;

    // Evita concentração excessiva em um grupo de dezenas
    const candidateGroup = Math.floor(candidate / 10);
    const groupCount = selected.filter(n => Math.floor(n / 10) === candidateGroup).length;
    if (groupCount > Math.ceil(selected.length / 3)) return false;

    // Mantém equilíbrio entre pares e ímpares
    const parCount = selected.filter(n => n % 2 === 0).length;
    const candidateIsPar = candidate % 2 === 0;
    const newParCount = candidateIsPar ? parCount + 1 : parCount;
    const totalCount = selected.length + 1;

    if (newParCount > totalCount * 0.7 || newParCount < totalCount * 0.3) return false;

    return true;
  }

  private chooseSmartNumber(available: number[], selected: number[], maxNumber: number): number {
    // Escolhe um número que melhore a distribuição geral
    return available.reduce((best, candidate) => {
      const balanceScore = this.calculateDistributionScore(selected, candidate, maxNumber);
      const bestScore = this.calculateDistributionScore(selected, best, maxNumber);
      return balanceScore > bestScore ? candidate : best;
    }, available[0]);
  }

  private calculateDistributionScore(selected: number[], candidate: number, maxNumber: number): number {
    const withCandidate = [...selected, candidate];

    // Pontuação baseada em distribuição equilibrada
    const groupDistribution = this.getGroupDistribution(withCandidate);
    const parityBalance = this.getParityBalance(withCandidate);
    const spreadScore = this.getSpreadScore(withCandidate, maxNumber);

    return groupDistribution + parityBalance + spreadScore;
  }

  private getGroupDistribution(numbers: number[]): number {
    const groups = new Map<number, number>();
    numbers.forEach(n => {
      const group = Math.floor(n / 10);
      groups.set(group, (groups.get(group) || 0) + 1);
    });

    // Penaliza concentração excessiva
    const maxGroupSize = Math.max(...Array.from(groups.values()));
    return maxGroupSize > numbers.length / 3 ? -0.5 : 0.3;
  }

  private getParityBalance(numbers: number[]): number {
    const parCount = numbers.filter(n => n % 2 === 0).length;
    const ratio = parCount / numbers.length;
    return Math.abs(ratio - 0.5) < 0.2 ? 0.3 : -0.2;
  }

  private getSpreadScore(numbers: number[], maxNumber: number): number {
    if (numbers.length < 2) return 0;

    const sorted = [...numbers].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    const idealRange = maxNumber * 0.7;

    return Math.abs(range - idealRange) / idealRange < 0.3 ? 0.2 : -0.1;
  }

  private applyIntelligentFilters(numbers: number[], latestDraws: any[], maxNumber: number, lotteryId: string): number[] {
    // Remove combinações que nunca saíram ou são estatisticamente impossíveis

    // Filtro 1: Evita repetição exata de jogos recentes
    const recentCombinations = latestDraws.slice(0, 5).map(draw => 
      draw.drawnNumbers ? draw.drawnNumbers.sort((a: number, b: number) => a - b).join(',') : ''
    );

    const currentCombination = [...numbers].sort((a, b) => a - b).join(',');
    if (recentCombinations.includes(currentCombination)) {
      // Substitui 1-2 números por outros inteligentes
      const substitutions = this.getSmartSubstitutions(numbers, maxNumber, latestDraws);
      return substitutions;
    }

    // Filtro 2: Evita padrões impossíveis específicos por modalidade
    if (this.isImpossiblePattern(numbers, lotteryId)) {
      return this.fixImpossiblePattern(numbers, maxNumber, lotteryId);
    }

    return numbers;
  }

  private getSmartSubstitutions(numbers: number[], maxNumber: number, latestDraws: any[]): number[] {
    const result = [...numbers];
    const toReplace = Math.min(2, Math.floor(numbers.length * 0.3));

    for (let i = 0; i < toReplace; i++) {
      const replaceIndex = Math.floor(Math.random() * result.length);
      const oldNumber = result[replaceIndex];

      // Encontra um substituto inteligente
      const candidates = Array.from({ length: maxNumber }, (_, i) => i + 1)
        .filter(n => !result.includes(n))
        .filter(n => Math.abs(n - oldNumber) > 5) // Evita números muito próximos
        .sort((a, b) => this.calculateSubstitutionScore(a, result, oldNumber) - this.calculateSubstitutionScore(b, result, oldNumber));

      if (candidates.length > 0) {
        result[replaceIndex] = candidates[0];
      }
    }

    return result;
  }

  private calculateSubstitutionScore(candidate: number, currentNumbers: number[], replacing: number): number {
    // Menor score = melhor substituto
    const distanceFromReplaced = Math.abs(candidate - replacing);
    const groupBalance = this.calculateGroupBalanceImpact(candidate, currentNumbers, replacing);
    const parityBalance = this.calculateParityBalanceImpact(candidate, currentNumbers, replacing);

    return distanceFromReplaced * 0.3 + groupBalance * 0.4 + parityBalance * 0.3;
  }

  private calculateGroupBalanceImpact(candidate: number, numbers: number[], replacing: number): number {
    const candidateGroup = Math.floor(candidate / 10);
    const replacingGroup = Math.floor(replacing / 10);

    const currentGroupCounts = new Map<number, number>();
    numbers.filter(n => n !== replacing).forEach(n => {
      const group = Math.floor(n / 10);
      currentGroupCounts.set(group, (currentGroupCounts.get(group) || 0) + 1);
    });

    const candidateGroupCount = currentGroupCounts.get(candidateGroup) || 0;
    const maxDesiredPerGroup = Math.ceil(numbers.length / 4);

    return candidateGroupCount >= maxDesiredPerGroup ? 10 : 0;
  }

  private calculateParityBalanceImpact(candidate: number, numbers: number[], replacing: number): number {
    const candidateIsPar = candidate % 2 === 0;
    const replacingIsPar = replacing % 2 === 0;

    const currentParCount = numbers.filter(n => n !== replacing && n % 2 === 0).length;
    const newParCount = candidateIsPar ? currentParCount + 1 : currentParCount;
    const total = numbers.length;

    const idealPars = Math.round(total * 0.5);
    return Math.abs(newParCount - idealPars);
  }

  private isImpossiblePattern(numbers: number[], lotteryId: string): boolean {
    // Padrões específicos por modalidade que nunca saíram

    if (lotteryId === 'megasena' || lotteryId === 'duplasena') {
      // Evita todos os números em uma única dezena
      const groups = new Map<number, number>();
      numbers.forEach(n => {
        const group = Math.floor(n / 10);
        groups.set(group, (groups.get(group) || 0) + 1);
      });

      if (Math.max(...Array.from(groups.values())) >= numbers.length) return true;

      // Evita sequências muito longas
      const sorted = [...numbers].sort((a, b) => a - b);
      let consecutive = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i-1] + 1) consecutive++;
        else consecutive = 1;
        if (consecutive > 4) return true;
      }
    }

    if (lotteryId === 'lotofacil') {
      // Para lotofácil, evita concentração excessiva nas extremidades
      const lowNumbers = numbers.filter(n => n <= 8).length;
      const highNumbers = numbers.filter(n => n >= 18).length;

      if (lowNumbers > 10 || highNumbers > 10) return true;
    }

    return false;
  }

  private fixImpossiblePattern(numbers: number[], maxNumber: number, lotteryId: string): number[] {
    // Corrige padrões impossíveis substituindo alguns números
    const result = [...numbers];
    const problematicIndices: number[] = [];

    // Identifica números problemáticos
    if (lotteryId === 'megasena' || lotteryId === 'duplasena') {
      const sorted = result.sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i-1] + 1 && sorted[i-1] === sorted[Math.max(0, i-2)] + 1) {
          problematicIndices.push(i);
        }
      }
    }

    // Substitui números problemáticos
    problematicIndices.forEach(index => {
      const alternatives = Array.from({ length: maxNumber }, (_, i) => i + 1)
        .filter(n => !result.includes(n))
        .filter(n => !this.wouldCreateNewProblem(n, result, index));

      if (alternatives.length > 0) {
        result[index] = alternatives[Math.floor(Math.random() * alternatives.length)];
      }
    });

    return result;
  }

  private wouldCreateNewProblem(candidate: number, numbers: number[], replaceIndex: number): boolean {
    const testNumbers = [...numbers];
    testNumbers[replaceIndex] = candidate;

    // Testa se criaria um novo padrão problemático
    const sorted = testNumbers.sort((a, b) => a - b);
    let consecutive = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1] + 1) consecutive++;
      else consecutive = 1;
      if (consecutive > 3) return true;
    }

    return false;
  }

  private validateNumberQuality(numbers: number[], statistical: any, count: number, maxNumber: number): number[] {
    // Validação final da qualidade dos números
    if (numbers.length !== count) {
      console.log(`Adjusting number count from ${numbers.length} to ${count}`);
      return this.adjustNumberCount(numbers, count, maxNumber, statistical);
    }

    // Remove duplicatas (se houver)
    const unique = [...new Set(numbers)];
    if (unique.length !== numbers.length) {
      return this.adjustNumberCount(unique, count, maxNumber, statistical);
    }

    return numbers;
  }

  private adjustNumberCount(numbers: number[], targetCount: number, maxNumber: number, statistical: any): number[] {
    const result = [...numbers];

    if (result.length < targetCount) {
      // Adiciona números faltantes
      const available = Array.from({ length: maxNumber }, (_, i) => i + 1)
        .filter(n => !result.includes(n));

      const needed = targetCount - result.length;
      const smartChoices = available
        .sort((a, b) => this.calculateSmartScore(a, result, statistical) - this.calculateSmartScore(b, result, statistical))
        .slice(0, needed);

      result.push(...smartChoices);
    } else if (result.length > targetCount) {
      // Remove números excedentes (os menos prováveis)
      const sorted = result
        .sort((a, b) => this.calculateSmartScore(b, result, statistical) - this.calculateSmartScore(a, result, statistical))
        .slice(0, targetCount);

      return sorted;
    }

    return result;
  }

  private calculateSmartScore(number: number, context: number[], statistical: any): number {
    const item = statistical.weightedFrequencies?.find((f: any) => f.number === number);
    const baseScore = item?.probabilityScore || 0;
    const distributionScore = this.calculateDistributionScore(context.filter(n => n !== number), number, 60);

    return baseScore + distributionScore * 0.3;
  }

  private generateIntelligentRandomNumbers(count: number, maxNumber: number, lotteryId: string): number[] {
    // Geração "aleatória" inteligente que evita padrões óbvios
    const numbers: number[] = [];
    const groupLimits = this.getGroupLimitsForLottery(lotteryId, maxNumber);
    const groupCounts = new Map<number, number>();

    // Inicializa contadores de grupos
    for (let i = 0; i <= Math.floor(maxNumber / 10); i++) {
      groupCounts.set(i, 0);
    }

    while (numbers.length < count) {
      let candidate: number;
      let attempts = 0;

      do {
        candidate = Math.floor(Math.random() * maxNumber) + 1;
        attempts++;
      } while (
        (numbers.includes(candidate) || 
         !this.isValidForIntelligentRandom(candidate, numbers, groupCounts, groupLimits, maxNumber)) 
        && attempts < 50
      );

      if (attempts < 50) {
        numbers.push(candidate);
        const group = Math.floor(candidate / 10);
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
      } else {
        // Fallback: pega qualquer número disponível
        const available = Array.from({ length: maxNumber }, (_, i) => i + 1)
          .filter(n => !numbers.includes(n));
        if (available.length > 0) {
          const fallback = available[Math.floor(Math.random() * available.length)];
          numbers.push(fallback);
          const group = Math.floor(fallback / 10);
          groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        }
      }
    }

    return numbers;
  }

  private getGroupLimitsForLottery(lotteryId: string, maxNumber: number): Map<number, number> {
    const limits = new Map<number, number>();
    const totalGroups = Math.ceil(maxNumber / 10);

    // Define limites específicos por modalidade
    switch (lotteryId) {
      case 'megasena':
      case 'duplasena':
        for (let i = 0; i < totalGroups; i++) {
          limits.set(i, 3); // Máximo 3 números por grupo de dezena
        }
        break;
      case 'lotofacil':
        for (let i = 0; i < totalGroups; i++) {
          limits.set(i, Math.ceil(15 / totalGroups) + 2);
        }
        break;
      default:
        for (let i = 0; i < totalGroups; i++) {
          limits.set(i, Math.ceil(maxNumber / (totalGroups * 2)));
        }
    }

    return limits;
  }

  private isValidForIntelligentRandom(
    candidate: number, 
    selected: number[], 
    groupCounts: Map<number, number>, 
    groupLimits: Map<number, number>, 
    maxNumber: number
  ): boolean {
    const group = Math.floor(candidate / 10);
    const currentGroupCount = groupCounts.get(group) || 0;
    const limit = groupLimits.get(group) || Math.ceil(maxNumber / 20);

    // Verifica limite do grupo
    if (currentGroupCount >= limit) return false;

    // Verifica sequências muito longas
    if (selected.length > 0) {
      const consecutive = selected.filter(n => Math.abs(n - candidate) === 1).length;
      if (consecutive > 2) return false;
    }

    // Verifica equilíbrio par/ímpar
    const parCount = selected.filter(n => n % 2 === 0).length;
    const candidateIsPar = candidate % 2 === 0;
    const newParCount = candidateIsPar ? parCount + 1 : parCount;
    const totalCount = selected.length + 1;

    if (newParCount > totalCount * 0.75 || newParCount < totalCount * 0.25) return false;

    return true;
  }

  private generateRandomNumbers(count: number, maxNumber: number): number[] {
    const numbers: number[] = [];
    const pool = Array.from({ length: maxNumber }, (_, i) => i + 1);

    // Generate exactly the requested count of numbers
    while (numbers.length < count && pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      numbers.push(pool.splice(randomIndex, 1)[0]);
    }

    console.log(`Generated ${numbers.length} random numbers (requested: ${count}, max: ${maxNumber})`);
    return numbers.sort((a, b) => a - b);
  }

  private async generateAINumbers(lotteryId: string, count: number, maxNumber: number, gameIndex: number = 0): Promise<number[]> {
    try {
      const frequencies = await storage.getNumberFrequencies(lotteryId);
      const latestDraws = await storage.getLatestDraws(lotteryId, 100); // Mais histórico para IA

      if (frequencies.length === 0) {
        console.log('Insufficient frequency data for AI, using advanced algorithmic generation');
        return this.generateAdvancedAlgorithmicNumbers(count, maxNumber, lotteryId);
      }

      console.log(`🤖 Iniciando análise de IA avançada para ${lotteryId}...`);

      // Análise multi-dimensional avançada
      const deepAnalysis = await this.performDeepAnalysis(frequencies, latestDraws, maxNumber, lotteryId);
      const predictionModel = this.buildPredictionModel(deepAnalysis, latestDraws, maxNumber);
      const probabilityMatrix = this.calculateProbabilityMatrix(predictionModel, maxNumber);

      // Aplicar algoritmos de machine learning simulado
      const neuralNetworkOutput = this.simulateNeuralNetwork(probabilityMatrix, count, maxNumber);
      const patternRecognition = this.applyPatternRecognition(latestDraws, neuralNetworkOutput, maxNumber);
      const temporalAnalysis = this.applyTemporalAnalysis(latestDraws, patternRecognition, lotteryId);

      // Seleção final com algoritmo genético simulado
      let finalNumbers = this.applyGeneticAlgorithm(temporalAnalysis, count, maxNumber, lotteryId);

      // Validação e otimização final
      finalNumbers = this.optimizeWithAdvancedValidation(finalNumbers, deepAnalysis, count, maxNumber, lotteryId);

      console.log(`🎯 IA gerou ${finalNumbers.length} números com alta precisão analítica`);
      return finalNumbers.sort((a, b) => a - b);

    } catch (error) {
      console.error('Error in advanced AI generation:', error);
      console.log('Falling back to advanced algorithmic generation');
      return this.generateAdvancedAlgorithmicNumbers(count, maxNumber, lotteryId);
    }
  }

  private async performDeepAnalysis(frequencies: any[], latestDraws: any[], maxNumber: number, lotteryId: string) {
    // Análise profunda multi-camadas
    const historical = this.analyzeHistoricalPatterns(latestDraws, maxNumber);
    const cyclical = this.analyzeAdvancedCycles(latestDraws, maxNumber);
    const mathematical = this.analyzeMathematicalProperties(frequencies, maxNumber);
    const seasonal = this.analyzeSeasonalTrends(latestDraws, maxNumber);
    const correlation = this.analyzeNumberCorrelations(latestDraws, maxNumber);

    return {
      historical,
      cyclical,
      mathematical,
      seasonal,
      correlation,
      confidence: this.calculateAnalysisConfidence(latestDraws.length, frequencies.length)
    };
  }

  private analyzeHistoricalPatterns(draws: any[], maxNumber: number) {
    const patterns = {
      gaps: new Map<number, number[]>(),
      sequences: new Map<string, number>(),
      distributions: new Map<string, number>(),
      hotStreaks: new Map<number, number>(),
      coldStreaks: new Map<number, number>()
    };

    // Análise de gaps (intervalos) entre aparições
    draws.forEach((draw, index) => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => {
          if (!patterns.gaps.has(num)) patterns.gaps.set(num, []);
          patterns.gaps.get(num)!.push(index);
        });
      }
    });

    // Converte posições em gaps reais
    patterns.gaps.forEach((positions, number) => {
      const gaps = positions.slice(1).map((pos, i) => pos - positions[i]);
      patterns.gaps.set(number, gaps);
    });

    // Análise de sequências comuns
    draws.slice(0, 50).forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 1) {
        const sorted = [...draw.drawnNumbers].sort((a: number, b: number) => a - b);
        for (let i = 0; i < sorted.length - 1; i++) {
          const sequence = `${sorted[i]}-${sorted[i + 1]}`;
          patterns.sequences.set(sequence, (patterns.sequences.get(sequence) || 0) + 1);
        }
      }
    });

    return patterns;
  }

  private analyzeAdvancedCycles(draws: any[], maxNumber: number) {
    const cycles = {
      shortTerm: new Map<number, number>(), // 5-10 sorteios
      mediumTerm: new Map<number, number>(), // 10-25 sorteios
      longTerm: new Map<number, number>(), // 25+ sorteios
      fibonacci: new Map<number, number>(), // Sequências de Fibonacci
      prime: new Map<number, number>() // Números primos
    };

    // Análise de ciclos de diferentes durações
    for (let num = 1; num <= maxNumber; num++) {
      const appearances: number[] = [];
      draws.forEach((draw, index) => {
        if (draw.drawnNumbers && draw.drawnNumbers.includes(num)) {
          appearances.push(index);
        }
      });

      if (appearances.length > 1) {
        const intervals = appearances.slice(1).map((pos, i) => pos - appearances[i]);

        // Classifica em ciclos
        intervals.forEach(interval => {
          if (interval <= 10) {
            cycles.shortTerm.set(num, (cycles.shortTerm.get(num) || 0) + 1);
          } else if (interval <= 25) {
            cycles.mediumTerm.set(num, (cycles.mediumTerm.get(num) || 0) + 1);
          } else {
            cycles.longTerm.set(num, (cycles.longTerm.get(num) || 0) + 1);
          }
        });
      }

      // Análise Fibonacci
      if (this.isFibonacci(num)) {
        cycles.fibonacci.set(num, appearances.length);
      }

      // Análise números primos
      if (this.isPrime(num)) {
        cycles.prime.set(num, appearances.length);
      }
    }

    return cycles;
  }

  private analyzeMathematicalProperties(frequencies: any[], maxNumber: number) {
    const properties = {
      entropy: 0,
      variance: 0,
      standardDeviation: 0,
      skewness: 0,
      kurtosis: 0,
      goldenRatio: new Map<number, number>(),
      digitalRoots: new Map<number, number>(),
      modularArithmetic: new Map<string, number>()
    };

    // Cálculos estatísticos avançados
    const frequencies_array = frequencies.map(f => f.frequency);
    const mean = frequencies_array.reduce((sum, f) => sum + f, 0) / frequencies_array.length;

    properties.variance = frequencies_array.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / frequencies_array.length;
    properties.standardDeviation = Math.sqrt(properties.variance);

    // Entropia de Shannon
    const total = frequencies_array.reduce((sum, f) => sum + f, 0);
    if (total > 0) {
      properties.entropy = -frequencies_array.reduce((sum, f) => {
        const p = f / total;
        return sum + (p > 0 ? p * Math.log2(p) : 0);
      }, 0);
    }

    // Análise da Proporção Áurea
    const phi = (1 + Math.sqrt(5)) / 2;
    frequencies.forEach(f => {
      const goldenScore = Math.abs((f.number * phi) % 1 - 0.5);
      properties.goldenRatio.set(f.number, goldenScore);
    });

    // Análise de raízes digitais
    frequencies.forEach(f => {
      const digitalRoot = this.calculateDigitalRoot(f.number);
      properties.digitalRoots.set(f.number, digitalRoot);
    });

    // Aritmética modular
    for (let mod = 2; mod <= 10; mod++) {
      for (let remainder = 0; remainder < mod; remainder++) {
        const key = `mod${mod}_rem${remainder}`;
        const count = frequencies.filter(f => f.number % mod === remainder).length;
        properties.modularArithmetic.set(key, count);
      }
    }

    return properties;
  }

  private analyzeSeasonalTrends(draws: any[], maxNumber: number) {
    const trends = {
      monthly: new Map<string, Map<number, number>>(),
      weekly: new Map<string, Map<number, number>>(),
      yearly: new Map<string, Map<number, number>>()
    };

    draws.forEach(draw => {
      if (draw.drawDate && draw.drawnNumbers) {
        const date = new Date(draw.drawDate);
        const month = date.getMonth();
        const weekday = date.getDay();
        const year = date.getFullYear();

        draw.drawnNumbers.forEach((num: number) => {
          // Tendências mensais
          const monthKey = `month_${month}`;
          if (!trends.monthly.has(monthKey)) trends.monthly.set(monthKey, new Map());
          const monthMap = trends.monthly.get(monthKey)!;
          monthMap.set(num, (monthMap.get(num) || 0) + 1);

          // Tendências semanais
          const weekKey = `week_${weekday}`;
          if (!trends.weekly.has(weekKey)) trends.weekly.set(weekKey, new Map());
          const weekMap = trends.weekly.get(weekKey)!;
          weekMap.set(num, (weekMap.get(num) || 0) + 1);

          // Tendências anuais
          const yearKey = `year_${year}`;
          if (!trends.yearly.has(yearKey)) trends.yearly.set(yearKey, new Map());
          const yearMap = trends.yearly.get(yearKey)!;
          yearMap.set(num, (yearMap.get(num) || 0) + 1);
        });
      }
    });

    return trends;
  }

  private analyzeNumberCorrelations(draws: any[], maxNumber: number) {
    const correlations = new Map<string, number>();
    const coOccurrences = new Map<string, number>();

    // Análise de co-ocorrências
    draws.slice(0, 50).forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 1) {
        for (let i = 0; i < draw.drawnNumbers.length; i++) {
          for (let j = i + 1; j < draw.drawnNumbers.length; j++) {
            const pair = `${Math.min(draw.drawnNumbers[i], draw.drawnNumbers[j])}-${Math.max(draw.drawnNumbers[i], draw.drawnNumbers[j])}`;
            coOccurrences.set(pair, (coOccurrences.get(pair) || 0) + 1);
          }
        }
      }
    });

    // Calcula correlações normalizadas
    coOccurrences.forEach((count, pair) => {
      const normalizedScore = count / Math.min(50, draws.length);
      correlations.set(pair, normalizedScore);
    });

    return { correlations, coOccurrences };
  }

  private buildPredictionModel(analysis: any, draws: any[], maxNumber: number) {
    const model = {
      weights: new Map<number, number>(),
      biases: new Map<number, number>(),
      confidenceScores: new Map<number, number>(),
      predictions: new Map<number, number>()
    };

    // Calcula pesos baseados em múltiplas análises
    for (let num = 1; num <= maxNumber; num++) {
      let totalWeight = 0;
      let factors = 0;

      // Peso histórico
      const gaps = analysis.historical.gaps.get(num) || [];
      if (gaps.length > 0) {
        const avgGap = gaps.reduce((sum: number, gap: number) => sum + gap, 0) / gaps.length;
        const consistency = 1 / (Math.abs(avgGap - 8) + 1); // 8 é um gap "ideal"
        totalWeight += consistency * 0.25;
        factors++;
      }

      // Peso cíclico
      const shortTermCycle = analysis.cyclical.shortTerm.get(num) || 0;
      const mediumTermCycle = analysis.cyclical.mediumTerm.get(num) || 0;
      const cycleScore = (shortTermCycle * 0.4 + mediumTermCycle * 0.6) / Math.max(draws.length, 1);
      totalWeight += cycleScore * 0.20;
      factors++;

      // Peso matemático
      const goldenScore = analysis.mathematical.goldenRatio.get(num) || 0.5;
      const mathScore = 1 - goldenScore; // Inverte porque menor distância da golden ratio é melhor
      totalWeight += mathScore * 0.15;
      factors++;

      // Peso sazonal (se disponível)
      const currentMonth = new Date().getMonth();
      const seasonalData = analysis.seasonal.monthly.get(`month_${currentMonth}`);
      if (seasonalData) {
        const seasonalFreq = seasonalData.get(num) || 0;
        const maxSeasonalFreq = Math.max(...Array.from(seasonalData.values()));
        const seasonalScore = maxSeasonalFreq > 0 ? seasonalFreq / maxSeasonalFreq : 0;
        totalWeight += seasonalScore * 0.10;
        factors++;
      }

      // Peso de correlação
      let correlationScore = 0;
      const correlationData = analysis.correlation.correlations;
      correlationData.forEach((score, pair) => {
        if (pair.includes(num.toString())) {
          correlationScore += score;
        }
      });
      totalWeight += Math.min(correlationScore / 10, 1) * 0.15; // Normaliza
      factors++;

      // Peso fibonacci/primo
      if (analysis.cyclical.fibonacci.has(num)) {
        totalWeight += 0.05;
      }
      if (analysis.cyclical.prime.has(num)) {
        totalWeight += 0.05;
      }

      // Finaliza cálculos
      const finalWeight = factors > 0 ? totalWeight / factors : 0.5;
      model.weights.set(num, finalWeight);

      // Calcula bias baseado em tendência recente
      const recentAppearances = draws.slice(0, 10).filter(draw => 
        draw.drawnNumbers && draw.drawnNumbers.includes(num)
      ).length;
      const bias = recentAppearances > 2 ? -0.1 : (recentAppearances === 0 ? 0.1 : 0);
      model.biases.set(num, bias);

      // Score de confiança
      const confidence = Math.min(analysis.confidence * finalWeight, 1);
      model.confidenceScores.set(num, confidence);

      // Predição final
      const prediction = Math.max(0, Math.min(1, finalWeight + bias));
      model.predictions.set(num, prediction);
    }

    return model;
  }

  private calculateProbabilityMatrix(model: any, maxNumber: number) {
    const matrix = new Map<number, {
      individual: number;
      conditional: Map<number, number>;
      combined: number;
    }>();

    for (let num = 1; num <= maxNumber; num++) {
      const individual = model.predictions.get(num) || 0;
      const conditional = new Map<number, number>();

      // Calcula probabilidades condicionais
      for (let other = 1; other <= maxNumber; other++) {
        if (num !== other) {
          const correlation = this.getCorrelationScore(num, other, model);
          conditional.set(other, correlation);
        }
      }

      // Score combinado
      const confidence = model.confidenceScores.get(num) || 0.5;
      const combined = individual * confidence;

      matrix.set(num, { individual, conditional, combined });
    }

    return matrix;
  }

  private getCorrelationScore(num1: number, num2: number, model: any): number {
    // Calcula correlação baseada em múltiplos fatores
    const weight1 = model.weights.get(num1) || 0.5;
    const weight2 = model.weights.get(num2) || 0.5;
    const avgWeight = (weight1 + weight2) / 2;

    // Penaliza números muito próximos (reduz sequências óbvias)
    const distance = Math.abs(num1 - num2);
    const distancePenalty = distance < 3 ? 0.3 : (distance < 6 ? 0.1 : 0);

    // Bonus para números em grupos diferentes
    const group1 = Math.floor(num1 / 10);
    const group2 = Math.floor(num2 / 10);
    const groupBonus = group1 !== group2 ? 0.1 : 0;

    return Math.max(0, avgWeight - distancePenalty + groupBonus);
  }

  private simulateNeuralNetwork(probabilityMatrix: any, count: number, maxNumber: number): number[] {
    const candidates: Array<{number: number, score: number}> = [];

    // Primeira camada: scoring individual
    probabilityMatrix.forEach((data, number) => {
      candidates.push({
        number,
        score: data.combined
      });
    });

    // Segunda camada: ajuste por contexto
    const contextAdjusted = candidates.map(candidate => {
      let contextScore = candidate.score;

      // Ajuste baseado em probabilidades condicionais
      probabilityMatrix.get(candidate.number)?.conditional.forEach((condScore, otherNumber) => {
        const otherCandidate = candidates.find(c => c.number === otherNumber);
        if (otherCandidate && otherCandidate.score > 0.6) {
          contextScore += condScore * 0.1; // Boost se outros números correlacionados têm alta probabilidade
        }
      });

      return {
        number: candidate.number,
        score: contextScore
      };
    });

    // Terceira camada: seleção final com diversidade
    const selected: number[] = [];
    const sortedCandidates = contextAdjusted.sort((a, b) => b.score - a.score);

    for (const candidate of sortedCandidates) {
      if (selected.length >= count) break;

      if (this.enhancesDiversity(candidate.number, selected, maxNumber)) {
        selected.push(candidate.number);
      }
    }

    // Completa se necessário
    while (selected.length < count) {
      const remaining = sortedCandidates
        .filter(c => !selected.includes(c.number))
        .sort((a, b) => b.score - a.score);

      if (remaining.length === 0) break;
      selected.push(remaining[0].number);
    }

    return selected;
  }

  private enhancesDiversity(candidate: number, selected: number[], maxNumber: number): boolean {
    if (selected.length === 0) return true;

    // Verifica diversidade de grupos
    const candidateGroup = Math.floor(candidate / 10);
    const groupCounts = new Map<number, number>();
    selected.forEach(num => {
      const group = Math.floor(num / 10);
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    });

    const maxGroupSize = Math.max(...Array.from(groupCounts.values()));
    const candidateGroupSize = groupCounts.get(candidateGroup) || 0;

    if (candidateGroupSize >= maxGroupSize && maxGroupSize >= 3) return false;

    // Verifica diversidade de paridade
    const parCount = selected.filter(n => n % 2 === 0).length;
    const candidateIsPar = candidate % 2 === 0;
    const newParRatio = (parCount + (candidateIsPar ? 1 : 0)) / (selected.length + 1);

    if (newParRatio > 0.75 || newParRatio < 0.25) return false;

    // Verifica sequências
    const consecutiveCount = selected.filter(n => Math.abs(n - candidate) === 1).length;
    if (consecutiveCount > 2) return false;

    return true;
  }

  private applyPatternRecognition(draws: any[], neuralOutput: number[], maxNumber: number): number[] {
    // Reconhece e evita padrões que nunca saíram
    const recognized = [...neuralOutput];
    const problematicPatterns = this.identifyProblematicPatterns(draws, maxNumber);

    // Verifica se o output atual contém padrões problemáticos
    const currentPattern = this.analyzeCurrentPattern(recognized);

    if (this.matchesProblematicPattern(currentPattern, problematicPatterns)) {
      return this.adjustForPatternAvoidance(recognized, problematicPatterns, maxNumber);
    }

    return recognized;
  }

  private identifyProblematicPatterns(draws: any[], maxNumber: number): string[] {
    const patterns: string[] = [];

    // Padrões que nunca apareceram em 100+ sorteios
    const allSequential = Array.from({length: 6}, (_, i) => i + 1).join(',');
    const allEven = [2,4,6,8,10,12].join(',');
    const allOdd = [1,3,5,7,9,11].join(',');
    const singleGroup = [10,11,12,13,14,15].join(','); // Todos em uma dezena

    patterns.push(allSequential, allEven, allOdd, singleGroup);

    // Analisa draws para identificar outros padrões que nunca saíram
    const existingPatterns = new Set<string>();
    draws.forEach(draw => {
      if (draw.drawnNumbers && draw.drawnNumbers.length > 0) {
        const pattern = [...draw.drawnNumbers].sort((a: number, b: number) => a - b).join(',');
        existingPatterns.add(pattern);
      }
    });

    return patterns.filter(p => !existingPatterns.has(p));
  }

  private analyzeCurrentPattern(numbers: number[]): string {
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted.join(',');
  }

  private matchesProblematicPattern(current: string, problematic: string[]): boolean {
    // Verifica correspondências exatas ou parciais significativas
    return problematic.some(pattern => {
      const currentNums = current.split(',').map(Number);
      const patternNums = pattern.split(',').map(Number);

      const matches = currentNums.filter(num => patternNums.includes(num)).length;
      return matches >= Math.min(4, patternNums.length * 0.8); // 80% de correspondência
    });
  }

  private adjustForPatternAvoidance(numbers: number[], problematic: string[], maxNumber: number): number[] {
    const adjusted = [...numbers];
    const toReplace = Math.floor(numbers.length * 0.3); // Substitui 30%

    for (let i = 0; i < toReplace && i < adjusted.length; i++) {
      const alternatives = Array.from({length: maxNumber}, (_, idx) => idx + 1)
        .filter(n => !adjusted.includes(n))
        .filter(n => this.isGoodAlternative(n, adjusted, i));

      if (alternatives.length > 0) {
        const bestAlternative = alternatives.sort((a, b) => 
          this.calculateAlternativeScore(a, adjusted, i) - this.calculateAlternativeScore(b, adjusted, i)
        )[0];
        adjusted[i] = bestAlternative;
      }
    }

    return adjusted;
  }

  private isGoodAlternative(candidate: number, current: number[], replaceIndex: number): boolean {
    const temp = [...current];
    temp[replaceIndex] = candidate;

    // Verifica se não cria novos problemas
    const sorted = temp.sort((a, b) => a - b);

    // Não deve criar sequências muito longas
    let consecutive = 1;
    let maxConsecutive = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1] + 1) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
    }

    return maxConsecutive <= 3;
  }

  private calculateAlternativeScore(candidate: number, current: number[], replaceIndex: number): number {
    // Menor score = melhor alternativa
    const original = current[replaceIndex];

    // Distância do original (preferir mudanças maiores)
    const distanceScore = Math.abs(candidate - original) / 60;

    // Diversidade de grupo
    const candidateGroup = Math.floor(candidate / 10);
    const groupCounts = new Map<number, number>();
    current.forEach((num, idx) => {
      if (idx !== replaceIndex) {
        const group = Math.floor(num / 10);
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
      }
    });
    const groupDiversityScore = (groupCounts.get(candidateGroup) || 0) / current.length;

    return distanceScore + groupDiversityScore;
  }

  private applyTemporalAnalysis(draws: any[], patternOutput: number[], lotteryId: string): number[] {
    // Análise temporal considerando tendências recentes vs históricas
    const temporal = [...patternOutput];

    if (draws.length < 10) return temporal;

    // Analisa tendência dos últimos 5 sorteios vs últimos 20
    const recent = draws.slice(0, 5);
    const historical = draws.slice(0, 20);

    const recentTrends = this.calculateTrends(recent);
    const historicalTrends = this.calculateTrends(historical);

    // Ajusta números baseado em divergências temporais
    temporal.forEach((num, index) => {
      const recentFreq = this.getNumberFrequencyInPeriod(num, recent);
      const historicalFreq = this.getNumberFrequencyInPeriod(num, historical);

      const trend = recentFreq - (historicalFreq / 4); // Normaliza por período

      // Se tendência recente é muito diferente da histórica, considera substituição
      if (Math.abs(trend) > 0.5 && Math.random() < 0.3) {
        const alternatives = this.getTemporalAlternatives(num, recentTrends, historicalTrends, temporal);
        if (alternatives.length > 0) {
          temporal[index] = alternatives[0];
        }
      }
    });

    return temporal;
  }

  private calculateTrends(draws: any[]): Map<number, number> {
    const trends = new Map<number, number>();

    draws.forEach(draw => {
      if (draw.drawnNumbers) {
        draw.drawnNumbers.forEach((num: number) => {
          trends.set(num, (trends.get(num) || 0) + 1);
        });
      }
    });

    return trends;
  }

  private getNumberFrequencyInPeriod(number: number, draws: any[]): number {
    return draws.filter(draw => 
      draw.drawnNumbers && draw.drawnNumbers.includes(number)
    ).length / Math.max(draws.length, 1);
  }

  private getTemporalAlternatives(original: number, recent: Map<number, number>, historical: Map<number, number>, current: number[]): number[] {
    const alternatives: number[] = [];

    // Procura números com tendência temporal oposta
    recent.forEach((recentFreq, num) => {
      const historicalFreq = historical.get(num) || 0;
      const originalRecentFreq = recent.get(original) || 0;
      const originalHistoricalFreq = historical.get(original) || 0;

      // Se original está "quente" recentemente, procura "frios" recentemente mas "quentes" historicamente
      if (originalRecentFreq > originalHistoricalFreq && recentFreq < historicalFreq && !current.includes(num)) {
        alternatives.push(num);
      }
    });

    return alternatives.sort((a, b) => 
      (historical.get(b) || 0) - (historical.get(a) || 0)
    ).slice(0, 3);
  }

  private applyGeneticAlgorithm(temporalOutput: number[], count: number, maxNumber: number, lotteryId: string): number[] {
    // Simula algoritmo genético para otimização final
    const population = this.createInitialPopulation(temporalOutput, count, maxNumber, 10);
    const evolved = this.evolvePopulation(population, count, maxNumber, lotteryId, 5);

    return evolved[0]; // Retorna o melhor indivíduo
  }

  private createInitialPopulation(base: number[], count: number, maxNumber: number, size: number): number[][] {
    const population: number[][] = [base.slice(0, count)];

    for (let i = 1; i < size; i++) {
      const individual = [...base];

      // Mutação: troca alguns números
      const mutations = Math.floor(count * 0.2) + 1;
      for (let j = 0; j < mutations; j++) {
        const index = Math.floor(Math.random() * individual.length);
        const alternatives = Array.from({length: maxNumber}, (_, idx) => idx + 1)
          .filter(n => !individual.includes(n));

        if (alternatives.length > 0) {
          individual[index] = alternatives[Math.floor(Math.random() * alternatives.length)];
        }
      }

      population.push(individual.slice(0, count));
    }

    return population;
  }

  private evolvePopulation(population: number[][], count: number, maxNumber: number, lotteryId: string, generations: number): number[][] {
    let current = [...population];

    for (let gen = 0; gen < generations; gen++) {
      // Avaliação de fitness
      const fitness = current.map(individual => 
        this.calculateFitness(individual, maxNumber, lotteryId)
      );

      // Seleção dos melhores
      const selected = current
        .map((individual, index) => ({individual, fitness: fitness[index]}))
        .sort((a, b) => b.fitness - a.fitness)
        .slice(0, Math.ceil(current.length / 2))
        .map(item => item.individual);

      // Crossover e mutação
      const newGeneration = [...selected];
      while (newGeneration.length < population.length) {
        const parent1 = selected[Math.floor(Math.random() * selected.length)];
        const parent2 = selected[Math.floor(Math.random() * selected.length)];
        const child = this.crossover(parent1, parent2, count, maxNumber);
        const mutated = this.mutate(child, maxNumber, 0.1);
        newGeneration.push(mutated);
      }

      current = newGeneration;
    }

    // Retorna população final ordenada por fitness
    const finalFitness = current.map(individual => 
      this.calculateFitness(individual, maxNumber, lotteryId)
    );

    return current
      .map((individual, index) => ({individual, fitness: finalFitness[index]}))
      .sort((a, b) => b.fitness - a.fitness)
      .map(item => item.individual);
  }

  private calculateFitness(individual: number[], maxNumber: number, lotteryId: string): number {
    let fitness = 0;

    // Diversidade de grupos
    const groups = new Map<number, number>();
    individual.forEach(num => {
      const group = Math.floor(num / 10);
      groups.set(group, (groups.get(group) || 0) + 1);
    });
    const groupVariance = this.calculateVariance(Array.from(groups.values()));
    fitness += Math.max(0, 1 - groupVariance); // Menor variância = melhor

    // Balanceamento par/ímpar
    const parCount = individual.filter(n => n % 2 === 0).length;
    const parityBalance = Math.abs(parCount / individual.length - 0.5);
    fitness += Math.max(0, 1 - parityBalance * 2);

    // Distribuição no range
    const sorted = [...individual].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    const idealRange = maxNumber * 0.7;
    const rangeScore = 1 - Math.abs(range - idealRange) / idealRange;
    fitness += Math.max(0, rangeScore);

    // Evita sequências muito longas
    let maxSequence = 1;
    let currentSequence = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1] + 1) {
        currentSequence++;
        maxSequence = Math.max(maxSequence, currentSequence);
      } else {
        currentSequence = 1;
      }
    }
    fitness += maxSequence <= 3 ? 0.5 : 0;

    return fitness;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  private crossover(parent1: number[], parent2: number[], count: number, maxNumber: number): number[] {
    const crossoverPoint = Math.floor(count / 2);
    const child = [
      ...parent1.slice(0, crossoverPoint),
      ...parent2.slice(crossoverPoint)
    ];

    // Remove duplicatas
    const unique = [...new Set(child)];

    // Completa se necessário
    while (unique.length < count) {
      const available = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !unique.includes(n));

      if (available.length === 0) break;
      unique.push(available[Math.floor(Math.random() * available.length)]);
    }

    return unique.slice(0, count);
  }

  private mutate(individual: number[], maxNumber: number, mutationRate: number): number[] {
    const mutated = [...individual];

    mutated.forEach((num, index) => {
      if (Math.random() < mutationRate) {
        const alternatives = Array.from({length: maxNumber}, (_, i) => i + 1)
          .filter(n => !mutated.includes(n));

        if (alternatives.length > 0) {
          mutated[index] = alternatives[Math.floor(Math.random() * alternatives.length)];
        }
      }
    });

    return mutated;
  }

  private optimizeWithAdvancedValidation(numbers: number[], analysis: any, count: number, maxNumber: number, lotteryId: string): number[] {
    let optimized = [...numbers];

    // Validação de qualidade final
    const qualityScore = this.calculateQualityScore(optimized, analysis, lotteryId);

    if (qualityScore < 0.7) {
      console.log(`⚠️  Qualidade baixa (${qualityScore.toFixed(2)}), aplicando otimização final...`);

      // Otimização por substituição inteligente
      const improvements = this.findImprovementOpportunities(optimized, analysis, maxNumber);
      improvements.forEach(({index, replacement}) => {
        optimized[index] = replacement;
      });
    }

    // Validação final
    optimized = this.ensureFinalValidation(optimized, count, maxNumber, lotteryId);

    return optimized;
  }

  private calculateQualityScore(numbers: number[], analysis: any, lotteryId: string): number {
    let score = 0;
    let factors = 0;

    // Score de diversidade
    const diversityScore = this.calculateDiversityScore(numbers);
    score += diversityScore;
    factors++;

    // Score de probabilidade (baseado na análise)
    const probabilityScore = this.calculateProbabilityScore(numbers, analysis);
    score += probabilityScore;
    factors++;

    // Score de padrões
    const patternScore = this.calculatePatternScore(numbers, lotteryId);
    score += patternScore;
    factors++;

    // Score de balance
    const balanceScore = this.calculateBalanceScore(numbers[0]); // Reutiliza função existente
    score += balanceScore;
    factors++;

    return factors > 0 ? score / factors : 0.5;
  }

  private calculateDiversityScore(numbers: number[]): number {
    // Implementação simplificada da função de diversidade
    return 0.8; // Placeholder - implementação completa seria mais complexa
  }

  private calculateProbabilityScore(numbers: number[], analysis: any): number {
    // Implementação simplificada do score de probabilidade
    return 0.75; // Placeholder
  }

  private calculatePatternScore(numbers: number[], lotteryId: string): number {
    // Implementação simplificada do score de padrões
    return this.isImpossiblePattern(numbers, lotteryId) ? 0.3 : 0.9;
  }

  private findImprovementOpportunities(numbers: number[], analysis: any, maxNumber: number): Array<{index: number, replacement: number}> {
    const improvements: Array<{index: number, replacement: number}> = [];

    numbers.forEach((num, index) => {
      // Procura alternativas melhores
      const alternatives = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !numbers.includes(n))
        .filter(n => this.wouldImproveQuality(n, num, numbers, index, analysis));

      if (alternatives.length > 0) {
        const bestAlternative = alternatives[0]; // Simplificado
        improvements.push({index, replacement: bestAlternative});
      }
    });

    return improvements.slice(0, 2); // Máximo 2 melhorias por vez
  }

  private wouldImproveQuality(candidate: number, original: number, numbers: number[], index: number, analysis: any): boolean {
    // Implementação simplificada - na prática seria mais robusta
    const candidateGroup = Math.floor(candidate / 10);
    const originalGroup = Math.floor(original / 10);

    // Melhora se move para grupo menos representado
    const groupCounts = new Map<number, number>();
    numbers.forEach((n, i) => {
      if (i !== index) {
        const group = Math.floor(n / 10);
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
      }
    });

    const candidateGroupCount = groupCounts.get(candidateGroup) || 0;
    const originalGroupCount = groupCounts.get(originalGroup) || 0;

    return candidateGroupCount < originalGroupCount;
  }

  private ensureFinalValidation(numbers: number[], count: number, maxNumber: number, lotteryId: string): number[] {
    let final = [...numbers];

    // Garantir contagem correta
    final = final.slice(0, count);
    if (final.length < count) {
      final = this.adjustNumberCount(final, count, maxNumber, {weightedFrequencies: []});
    }

    // Remover duplicatas
    final = [...new Set(final)];
    if (final.length < count) {
      final = this.adjustNumberCount(final, count, maxNumber, {weightedFrequencies: []});
    }

    // Aplicar filtros finais específicos da modalidade
    final = this.applyLotterySpecificFilters(final, lotteryId, maxNumber);

    return final.sort((a, b) => a - b);
  }

  private applyLotterySpecificFilters(numbers: number[], lotteryId: string, maxNumber: number): number[] {
    let filtered = [...numbers];

    switch (lotteryId) {
      case 'megasena':
        // Mega-Sena: evitar mais de 3 números em sequência
        filtered = this.limitConsecutiveNumbers(filtered, 3, maxNumber);
        break;
      case 'lotofacil':
        // Lotofácil: balancear extremos (1-8 vs 18-25)
        filtered = this.balanceLotofacilExtremes(filtered, maxNumber);
        break;
      case 'quina':
        // Quina: distribuir bem pelos grupos de dezenas
        filtered = this.distributeQuinaGroups(filtered, maxNumber);
        break;
      case 'supersete':
        // Super Sete: limitar repetições por coluna
        filtered = this.limitSuperSeteColumns(filtered);
        break;
    }

    return filtered;
  }

  private limitConsecutiveNumbers(numbers: number[], maxConsecutive: number, maxNumber: number): number[] {
    const sorted = [...numbers].sort((a, b) => a - b);
    const result: number[] = [];
    let consecutiveCount = 1;

    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i] !== sorted[i-1] + 1) {
        consecutiveCount = 1;
        result.push(sorted[i]);
      } else if (consecutiveCount < maxConsecutive) {
        consecutiveCount++;
        result.push(sorted[i]);
      } else {
        // Substitui por um número não consecutivo
        const alternatives = Array.from({length: maxNumber}, (_, idx) => idx + 1)
          .filter(n => !result.includes(n) && !sorted.includes(n))
          .filter(n => Math.abs(n - sorted[i]) > 2);

        if (alternatives.length > 0) {
          result.push(alternatives[0]);
        }
      }
    }

    return result;
  }

  private balanceLotofacilExtremes(numbers: number[], maxNumber: number): number[] {
    const low = numbers.filter(n => n <= 8);
    const high = numbers.filter(n => n >= 18);
    const middle = numbers.filter(n => n > 8 && n < 18);

    // Se muito desequilibrado, ajusta
    if (low.length > 8 || high.length > 8) {
      const result = [...middle];
      result.push(...low.slice(0, 7));
      result.push(...high.slice(0, 7));

      // Completa com números do meio
      while (result.length < numbers.length) {
        const available = Array.from({length: maxNumber}, (_, i) => i + 1)
          .filter(n => !result.includes(n) && n > 8 && n < 18);

        if (available.length === 0) break;
        result.push(available[0]);
      }

      return result;
    }

    return numbers;
  }

  private distributeQuinaGroups(numbers: number[], maxNumber: number): number[] {
    // Distribui números da Quina pelos grupos de dezenas (0-9, 10-19, etc.)
    const groups = new Map<number, number[]>();

    numbers.forEach(num => {
      const group = Math.floor(num / 10);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(num);
    });

    // Limita a 2 números por grupo
    const result: number[] = [];
    groups.forEach(groupNumbers => {
      result.push(...groupNumbers.slice(0, 2));
    });

    // Completa se necessário
    while (result.length < numbers.length) {
      const available = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !result.includes(n));

      if (available.length === 0) break;

      // Prefere números de grupos menos representados
      const groupCounts = new Map<number, number>();
      result.forEach(n => {
        const group = Math.floor(n / 10);
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
      });

      const bestOption = available.find(n => {
        const group = Math.floor(n / 10);
        return (groupCounts.get(group) || 0) < 2;
      }) || available[0];

      result.push(bestOption);
    }

    return result;
  }

  private limitSuperSeteColumns(numbers: number[]): number[] {
    // Super Sete tem 7 colunas de 0-9
    // Evita repetição excessiva do mesmo dígito
    const digitCounts = new Map<number, number>();

    numbers.forEach(num => {
      const digit = num % 10;
      digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1);
    });

    // Se algum dígito aparece mais de 3 vezes, substitui
    const result = [...numbers];
    digitCounts.forEach((count, digit) => {
      if (count > 3) {
        const indices = result
          .map((num, idx) => num % 10 === digit ? idx : -1)
          .filter(idx => idx !== -1);

        // Substitui os excedentes
        for (let i = 3; i < indices.length; i++) {
          const index = indices[i];
          const alternatives = [0,1,2,3,4,5,6,7,8,9]
            .filter(d => (digitCounts.get(d) || 0) < 2)
            .filter(d => !result.some(n => n % 10 === d));

          if (alternatives.length > 0) {
            result[index] = alternatives[0];
          }
        }
      }
    });

    return result;
  }

  private generateAdvancedAlgorithmicNumbers(count: number, maxNumber: number, lotteryId: string): number[] {
    // Fallback inteligente quando dados são insuficientes
    console.log(`🔬 Usando algoritmos matemáticos avançados para ${lotteryId}`);

    const algorithms = [
      () => this.generateGoldenRatioBasedNumbers(count, maxNumber),
      () => this.generateFibonacciBasedNumbers(count, maxNumber),
      () => this.generatePrimeBasedNumbers(count, maxNumber),
      () => this.generateMathematicalSequenceNumbers(count, maxNumber)
    ];

    // Usa diferentes algoritmos baseado no lotteryId
    const algorithmIndex = lotteryId.charCodeAt(0) % algorithms.length;
    return algorithms[algorithmIndex]();
  }

  private generateGoldenRatioBasedNumbers(count: number, maxNumber: number): number[] {
    const phi = (1 + Math.sqrt(5)) / 2;
    const numbers: number[] = [];

    for (let i = 1; numbers.length < count && i <= maxNumber; i++) {
      const goldenTest = (i * phi) % 1;
      if (goldenTest > 0.3 && goldenTest < 0.7) { // "Sweet spot" da golden ratio
        numbers.push(i);
      }
    }

    // Completa se necessário
    while (numbers.length < count) {
      const available = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !numbers.includes(n));

      if (available.length === 0) break;
      numbers.push(available[Math.floor(Math.random() * available.length)]);
    }

    return numbers;
  }

  private generateFibonacciBasedNumbers(count: number, maxNumber: number): number[] {
    const fibonacci: number[] = [1, 1];
    while (fibonacci[fibonacci.length - 1] < maxNumber) {
      const next = fibonacci[fibonacci.length - 1] + fibonacci[fibonacci.length - 2];
      fibonacci.push(next);
    }

    const fibNumbers = fibonacci.filter(f => f <= maxNumber);
    const numbers: number[] = [];

    // Seleciona números próximos aos de Fibonacci
    fibNumbers.forEach(fib => {
      if (numbers.length < count) {
        numbers.push(fib);
      }
    });

    // Completa com números relacionados
    while (numbers.length < count) {
      const available = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !numbers.includes(n))
        .sort((a, b) => {
          const aDist = Math.min(...fibNumbers.map(f => Math.abs(a - f)));
          const bDist = Math.min(...fibNumbers.map(f => Math.abs(b - f)));
          return aDist - bDist;
        });

      if (available.length === 0) break;
      numbers.push(available[0]);
    }

    return numbers;
  }

  private generatePrimeBasedNumbers(count: number, maxNumber: number): number[] {
    const primes: number[] = [];
    for (let i = 2; i <= maxNumber; i++) {
      if (this.isPrime(i)) primes.push(i);
    }

    const numbers: number[] = [];

    // Seleciona alguns primos
    const primeCount = Math.min(Math.ceil(count * 0.4), primes.length);
    for (let i = 0; i < primeCount && i < primes.length; i += Math.ceil(primes.length / primeCount)) {
      numbers.push(primes[i]);
    }

    // Completa com números compostos balanceados
    while (numbers.length < count) {
      const available = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !numbers.includes(n))
        .filter(n => !this.isPrime(n)); // Só compostos para balance

      if (available.length === 0) {
        // Se só restaram primos, usa eles
        const availablePrimes = primes.filter(p => !numbers.includes(p));
        if (availablePrimes.length > 0) {
          numbers.push(availablePrimes[0]);
        }
        break;
      }

      numbers.push(available[Math.floor(Math.random() * available.length)]);
    }

    return numbers;
  }

  private generateMathematicalSequenceNumbers(count: number, maxNumber: number): number[] {
    // Combina diferentes sequências matemáticas
    const sequences = {
      squares: Array.from({length: Math.floor(Math.sqrt(maxNumber))}, (_, i) => (i + 1) * (i + 1)).filter(n => n <= maxNumber),
      triangular: [],
      pentagonal: []
    };

    // Números triangulares: n(n+1)/2
    for (let i = 1; i * (i + 1) / 2 <= maxNumber; i++) {
      sequences.triangular.push(i * (i + 1) / 2);
    }

    // Números pentagonais: n(3n-1)/2
    for (let i = 1; i * (3 * i - 1) / 2 <= maxNumber; i++) {
      sequences.pentagonal.push(i * (3 * i - 1) / 2);
    }

    const allSequenceNumbers = [
      ...sequences.squares,
      ...sequences.triangular,
      ...sequences.pentagonal
    ].filter((n, index, arr) => arr.indexOf(n) === index && n <= maxNumber);

    const numbers: number[] = [];

    // Seleciona de diferentes sequências
    const sequenceCount = Math.min(Math.ceil(count * 0.5), allSequenceNumbers.length);
    allSequenceNumbers.slice(0, sequenceCount).forEach(n => numbers.push(n));

    // Completa aleatoriamente
    while (numbers.length < count) {
      const available = Array.from({length: maxNumber}, (_, i) => i + 1)
        .filter(n => !numbers.includes(n));

      if (available.length === 0) break;
      numbers.push(available[Math.floor(Math.random() * available.length)]);
    }

    return numbers;
  }

  // Funções auxiliares matemáticas
  private isFibonacci(n: number): boolean {
    const phi = (1 + Math.sqrt(5)) / 2;
    const psi = (1 - Math.sqrt(5)) / 2;
    const fibN = Math.round((Math.pow(phi, n) - Math.pow(psi, n)) / Math.sqrt(5));
    return fibN === n;
  }

  private isPrime(n: number): boolean {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;

    for (let i = 3; i <= Math.sqrt(n); i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  }

  private calculateDigitalRoot(n: number): number {
    while (n >= 10) {
      n = n.toString().split('').reduce((sum, digit) => sum + parseInt(digit), 0);
    }
    return n;
  }

  private calculateAnalysisConfidence(drawsCount: number, frequenciesCount: number): number {
    const drawsScore = Math.min(drawsCount / 100, 1); // 100+ draws = confidence 1
    const freqScore = Math.min(frequenciesCount / 60, 1); // 60+ frequencies = confidence 1
    return (drawsScore + freqScore) / 2;
  }

  async syncLatestDraws(): Promise<void> {
    try {
      console.log('Syncing latest draws from official Caixa API...');

      const lotteries = await storage.getLotteryTypes();

      for (const lottery of lotteries) {
        try {
          const realData = await this.fetchRealLotteryData(lottery.id);
          if (realData) {
            console.log(`✓ Synced ${lottery.displayName} - Contest #${realData.contestNumber - 1}`);
          }

          // Small delay to avoid API rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error syncing ${lottery.id}:`, error);
        }
      }

      console.log('Sync completed');
    } catch (error) {
      console.error('Error syncing latest draws:', error);
    }
  }

  async updateNumberFrequencies(lotteryId: string): Promise<void> {
    try {
      console.log(`Updating frequencies for ${lotteryId} based on real data...`);

      // Get lottery type info
      const lottery = await storage.getLotteryType(lotteryId);
      if (!lottery) return;

      // Get latest draws from database
      const draws = await storage.getLatestDraws(lotteryId, 100); // Last 100 draws for good frequency analysis

      // Initialize all numbers with 0 frequency if no draws exist
      if (draws.length === 0) {
        console.log(`No draws found for ${lotteryId}, initializing with zero frequencies...`);
        for (let i = 1; i <= lottery.totalNumbers; i++) {
          try {
            await storage.updateNumberFrequency({
              lotteryId,
              number: i,
              frequency: 0,
              lastDrawn: null,
              drawsSinceLastSeen: 0
            });
          } catch (dbError) {
            continue;
          }
        }
        return;
      }

      if (draws.length > 0) {
        const lottery = await storage.getLotteryType(lotteryId);
        if (!lottery) return;

        // Calculate frequencies from real draw data
        const frequencies: { [key: number]: number } = {};

        // Initialize all numbers with 0 frequency
        for (let i = 1; i <= lottery.totalNumbers; i++) {
          frequencies[i] = 0;
        }

        // Count frequencies from actual draws
        draws.forEach(draw => {
          if (draw.drawnNumbers && draw.drawnNumbers.length > 0) {
            draw.drawnNumbers.forEach(num => {
              if (typeof num === 'number' && num >= 1 && num <= lottery.totalNumbers) {
                frequencies[num]++;
              }
            });
          }
        });

        // Store updated frequencies
        const totalDraws = draws.length;
        for (const [number, count] of Object.entries(frequencies)) {
          const frequency = count; // Use raw count instead of percentage

          try {
            await storage.updateNumberFrequency({
              lotteryId,
              number: parseInt(number),
              frequency,
              lastDrawn: this.findLastDrawnDate(parseInt(number), draws),
              drawsSinceLastSeen: this.countDrawsSinceLastSeen(parseInt(number), draws)
            });
          } catch (dbError) {
            // Continue with next number if database error
            continue;
          }
        }

        console.log(`✓ Updated frequencies for ${lotteryId} based on ${totalDraws} real draws`);
      } else {
        console.log(`No draw data available for ${lotteryId} frequency calculation`);
      }
    } catch (error) {
      console.error('Error updating frequencies:', error);
    }
  }

  private findLastDrawnDate(number: number, draws: any[]): Date | null {
    for (const draw of draws) {
      if (draw.drawnNumbers && draw.drawnNumbers.includes(number)) {
        return new Date(draw.drawDate);
      }
    }
    return null;
  }

  private countDrawsSinceLastSeen(number: number, draws: any[]): number {
    let count = 0;
    for (const draw of draws) {
      if (draw.drawnNumbers && draw.drawnNumbers.includes(number)) {
        return count;
      }
      count++;
    }
    return count;
  }

  private calculatePrize(lotteryId: string, matches: number): string {
    const prizeTable: Record<string, Record<number, string>> = {
      megasena: {
        6: "100000.00",
        5: "2500.00",
        4: "150.00",
      },
      lotofacil: {
        15: "500000.00",
        14: "1500.00",
        13: "200.00",
        12: "75.00",
        11: "25.00",
      },
      quina: {
        5: "50000.00",
        4: "800.00",
        3: "120.00",
        2: "25.00",
      },
      lotomania: {
        20: "1000000.00",
        19: "15000.00",
        18: "2000.00",
        17: "200.00",
        16: "100.00",
        0: "500.00",
      },
    };

    return prizeTable[lotteryId]?.[matches] || "0.00";
  }

  // Função que foi corrigida: selectRandom
  private selectRandom(pool: number[], count: number, gameIndex: number = 0): number[] {
    const selected: number[] = [];
    const available = [...pool];

    // 🎲 Seed único por jogo para garantir variação
    const seed = Date.now() * (gameIndex + 1) * Math.random();

    // Função de random com seed
    const seededRandom = () => {
      const x = Math.sin(seed * selected.length + gameIndex) * 10000;
      return (x - Math.floor(x)) * Math.random();
    };

    while (selected.length < count && available.length > 0) {
      const randomIndex = Math.floor(seededRandom() * available.length);
      selected.push(available.splice(randomIndex, 1)[0]);
    }

    return selected.sort((a, b) => a - b);
  }
}


export const lotteryService = new LotteryService();