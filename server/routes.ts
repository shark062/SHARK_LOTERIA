import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth & Integrations
  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);
  registerImageRoutes(app);

  // WebSocket Server for "Private Websocket Server" (Simulated Live Updates)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('Client connected to websocket');
    
    // Send initial welcome/status
    ws.send(JSON.stringify({ type: 'status', message: 'Shark Loteria Server: Online 24/7' }));

    // Simulate "Learning" updates
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'learning_update', 
          message: 'AI Analyzing new patterns...', 
          progress: Math.floor(Math.random() * 100) 
        }));
      }
    }, 10000);

    ws.on('close', () => clearInterval(interval));
  });

  // API Routes

  // Get Games List
  app.get(api.lottery.list.path, async (req, res) => {
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const games = await storage.getLotteryGames(type, limit);
    res.json(games);
  });

  // Get Latest Game
  app.get(api.lottery.latest.path, async (req, res) => {
    const type = req.params.type;
    const game = await storage.getLatestLotteryGame(type);
    if (!game) return res.status(404).json({ message: "No game found" });
    res.json(game);
  });

  // Analyze Game (AI Integration)
  app.get(api.lottery.analyze.path, async (req, res) => {
    const type = req.params.type;
    const stats = await storage.getGameStats(type);
    
    // Simulate AI recommendation (In real app, call OpenAI here with stats)
    const recommendation = `Based on the last 20 contests for ${type}, we observe a high frequency of numbers ${stats.hotNumbers.join(', ')}. 
    The AI suggests a mixed strategy combining these with the cold numbers ${stats.coldNumbers.slice(0,2).join(', ')} for balanced variance.`;

    res.json({
      recommendation,
      stats
    });
  });

  // Generate Numbers
  app.post(api.lottery.generate.path, async (req, res) => {
    const { gameType, quantity, amountOfGames, strategy } = req.body;
    
    const stats = await storage.getGameStats(gameType);
    const generated = [];

    // Strategy Logic
    for (let i = 0; i < amountOfGames; i++) {
      let nums: number[] = [];
      const pool = Array.from({ length: 60 }, (_, i) => i + 1); // Default 60 numbers
      
      // Filter pool based on strategy
      let validPool = pool;
      if (strategy === 'hot') validPool = stats.hotNumbers.length > 0 ? stats.hotNumbers : pool;
      if (strategy === 'cold') validPool = stats.coldNumbers.length > 0 ? stats.coldNumbers : pool;
      
      // Generate unique numbers
      while (nums.length < (quantity || 6)) { // Default to 6 if quantity 0
        const randomIndex = Math.floor(Math.random() * validPool.length);
        const num = validPool[randomIndex];
        if (!nums.includes(num)) {
          nums.push(num);
        }
      }
      generated.push({
        numbers: nums.sort((a, b) => a - b),
        strategy
      });
    }

    res.json(generated);
  });

  // User Games Routes
  app.get(api.userGames.list.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    // Type assertion for req.user from Replit Auth
    const userId = (req.user as any).claims?.sub; 
    const games = await storage.getUserGames(userId);
    res.json(games);
  });

  app.post(api.userGames.create.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const userId = (req.user as any).claims?.sub;
    
    try {
      const input = api.userGames.create.input.parse(req.body);
      const game = await storage.createGeneratedGame({ ...input, userId });
      res.status(201).json(game);
    } catch (e) {
      res.status(400).json({ message: "Validation error" });
    }
  });

  // Seed Data function (Run once)
  seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getLatestLotteryGame('mega-sena');
  if (!existing) {
    console.log("Seeding database with mock lottery data...");
    // Mock last 20 Mega-Sena games
    for (let i = 0; i < 20; i++) {
      await storage.createLotteryGame({
        gameType: 'mega-sena',
        contestNumber: 2700 + i,
        date: new Date(Date.now() - (20 - i) * 86400000 * 3).toISOString(), // Every 3 days
        numbers: Array.from({ length: 6 }, () => Math.floor(Math.random() * 60) + 1).sort((a, b) => a - b),
        prizeEstimate: 15000000 + Math.random() * 50000000,
        winnersCount: Math.floor(Math.random() * 3),
        nextPrizeEstimate: 20000000,
      });
    }
    // Mock Lotofacil
    for (let i = 0; i < 20; i++) {
      await storage.createLotteryGame({
        gameType: 'lotofacil',
        contestNumber: 3000 + i,
        date: new Date(Date.now() - (20 - i) * 86400000).toISOString(), // Daily
        numbers: Array.from({ length: 15 }, () => Math.floor(Math.random() * 25) + 1).sort((a, b) => a - b),
        prizeEstimate: 1700000,
        winnersCount: Math.floor(Math.random() * 5) + 1,
        nextPrizeEstimate: 1700000,
      });
    }
  }
}
