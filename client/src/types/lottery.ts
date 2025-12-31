export interface LotteryType {
  id: string;
  name: string;
  displayName: string;
  minNumbers: number;
  maxNumbers: number;
  totalNumbers: number;
  drawDays: string[];
  drawTime: string;
  isActive: boolean;
}

export interface LotteryDraw {
  id: number;
  lotteryId: string;
  contestNumber: number;
  drawDate: Date;
  drawnNumbers: number[];
  prizeAmount: string;
  winners: WinnerInfo[];
  isOfficial: boolean;
}

export interface WinnerInfo {
  tier: string;
  winners: number;
  prizePerWinner: string;
  totalPrize: string;
}

export interface UserGame {
  id: number;
  userId: string;
  lotteryId: string;
  selectedNumbers: number[];
  contestNumber: number;
  strategy: string;
  isPlayed: boolean;
  matches: number;
  prizeWon: string;
  createdAt: Date;
}

export interface NumberFrequency {
  id: number;
  lotteryId: string;
  number: number;
  frequency: number;
  lastDrawn: Date | null;
  temperature: 'hot' | 'warm' | 'cold';
}

export interface NextDrawInfo {
  contestNumber: number;
  drawDate: string;
  drawTime: string;
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  estimatedPrize: string;
}

export interface UserStats {
  totalGames: number;
  wins: number;
  accuracy: number;
  totalPrizeWon: string;
}

export interface AIAnalysis {
  id: number;
  lotteryId: string;
  analysisType: string;
  result: any;
  confidence: string;
  createdAt: Date;
}
