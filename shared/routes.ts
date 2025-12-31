import { z } from 'zod';
import { insertGeneratedGameSchema, lotteryGames, generatedGames } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  lottery: {
    list: {
      method: 'GET' as const,
      path: '/api/lottery/games',
      input: z.object({
        type: z.string().optional(),
        limit: z.coerce.number().optional().default(20),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof lotteryGames.$inferSelect>()),
      },
    },
    latest: {
      method: 'GET' as const,
      path: '/api/lottery/latest/:type',
      responses: {
        200: z.custom<typeof lotteryGames.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    analyze: {
      method: 'GET' as const,
      path: '/api/lottery/analyze/:type',
      responses: {
        200: z.object({
          recommendation: z.string(),
          stats: z.object({
            hotNumbers: z.array(z.number()),
            coldNumbers: z.array(z.number()),
            rareNumbers: z.array(z.number()),
            frequencyMap: z.record(z.number()),
          }),
        }),
      },
    },
    generate: {
      method: 'POST' as const,
      path: '/api/lottery/generate',
      input: z.object({
        gameType: z.string(),
        quantity: z.number().min(0).max(60),
        amountOfGames: z.number().min(1).max(50),
        strategy: z.enum(["hot", "cold", "mixed", "random"]),
      }),
      responses: {
        200: z.array(z.object({
          numbers: z.array(z.number()),
          strategy: z.string(),
        })),
      },
    },
  },
  userGames: {
    list: {
      method: 'GET' as const,
      path: '/api/user/games',
      responses: {
        200: z.array(z.custom<typeof generatedGames.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/user/games',
      input: insertGeneratedGameSchema,
      responses: {
        201: z.custom<typeof generatedGames.$inferSelect>(),
      },
    },
    check: { // Check games against results
      method: 'POST' as const,
      path: '/api/user/games/check',
      responses: {
        200: z.object({
          updatedCount: z.number(),
        }),
      },
    }
  },
};

// ============================================
// REQUIRED: buildUrl helper
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// ============================================
// WEBSOCKET EVENTS
// ============================================
export const ws = {
  // Client sends these
  send: {
    subscribe: z.object({ gameType: z.string() }),
  },
  // Server broadcasts these
  receive: {
    liveUpdate: z.object({ 
      type: z.string(), 
      data: z.custom<typeof lotteryGames.$inferSelect>(),
      message: z.string() // "New draw result!"
    }),
  },
};
