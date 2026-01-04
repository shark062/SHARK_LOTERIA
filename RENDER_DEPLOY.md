# Deploy no Render - Shark Loterias

Este projeto está configurado para ser um **Web Service** no Render.

## 1. Configurações de Build
- **Runtime:** Node
- **Build Command:** `npm run build`
- **Start Command:** `npm start`

## 2. Variáveis de Ambiente Necessárias
Configure as seguintes variáveis no painel do Render:
- `DATABASE_URL`: Sua URL do PostgreSQL.
- `SESSION_SECRET`: Uma string aleatória para sessões.
- `JWT_SECRET`: Uma string aleatória para tokens JWT.
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Sua chave da OpenAI.

## 3. Banco de Dados
O Render oferece instâncias de PostgreSQL que podem ser conectadas via `DATABASE_URL`.
