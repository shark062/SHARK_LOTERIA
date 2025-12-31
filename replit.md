# Shark Loterias

## Overview

Shark Loterias is a Brazilian lottery analysis and prediction platform that combines advanced AI/ML algorithms with statistical analysis to provide intelligent game recommendations. The application supports all major Brazilian lottery types (Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Super Sete, +Milionária, Timemania, Dia de Sorte) and offers features including heat maps, number frequency analysis, AI-powered predictions, and game generation with multiple strategies.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: Radix UI primitives with shadcn/ui component library (New York style)
- **Styling**: Tailwind CSS with CSS variables for theming, custom cyberpunk/neon aesthetic
- **Build Tool**: Vite with React plugin
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints under `/api/` prefix
- **Authentication**: Dual system supporting Replit Auth (OpenID Connect) and JWT-based authentication with bcrypt password hashing
- **Session Management**: PostgreSQL-backed sessions using connect-pg-simple
- **Middleware**: Custom auth middleware with role-based access (FREE/PREMIUM tiers)

### Data Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-kit for migrations
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Tables**: users, sessions, lottery_types, lottery_draws, user_games, ai_analysis, predictions, model_performance

### AI/ML Services Architecture
The application implements a sophisticated multi-AI ensemble system:
- **Multi-Provider Integration**: OpenAI, Google Gemini, Anthropic Claude, DeepSeek, Groq
- **Fusion Engine**: Combines responses from multiple AI providers for consensus predictions
- **Advanced Analysis Services**:
  - Correlation analysis between numbers
  - Pattern recognition (Fibonacci, prime numbers, sequences)
  - Temporal analysis with simulated LSTM
  - Hybrid scoring with adaptive weights
  - Genetic algorithm-based game generation
- **Performance Tracking**: Records predictions and compares against actual results for continuous improvement
- **Caching**: Memory-based cache with TTL for API responses and analysis results

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts`: Drizzle database schema definitions
- `lotteryConstants.ts`: Centralized lottery configurations (number ranges, draw days, prize categories)
- `dataValidation.ts`: Zod schemas for input validation
- `routes.ts`: API contract definitions with Zod schemas

### Build System
- **Development**: tsx for running TypeScript directly, Vite dev server with HMR
- **Production**: Custom build script using esbuild for server bundling, Vite for client bundling
- **Output**: `dist/` directory with `index.cjs` (server) and `public/` (static assets)

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database queries and schema management

### AI Services (API Keys Required)
- **OpenAI**: GPT models for analysis and predictions (`OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`)
- **Google Gemini**: Alternative AI provider (`GEMINI_API_KEY`)
- **Anthropic Claude**: Alternative AI provider (`ANTHROPIC_API_KEY`)
- **Groq**: Fast inference provider (`GROQ_API_KEY`)

### External APIs
- **Caixa Loterias API**: Official Brazilian lottery results
- **Loteriascaixa-api**: Fallback API for lottery data

### Authentication
- **Replit Auth**: OpenID Connect integration for Replit-hosted authentication
- **JWT**: Self-contained tokens for API authentication (`JWT_SECRET`)

### Payment (Placeholder)
- PIX payment integration service exists but requires implementation with actual payment provider (Mercado Pago, Stripe, etc.)

### PWA Support
- Service worker for offline capabilities
- Web app manifest for installable PWA