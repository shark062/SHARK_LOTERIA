# Relatório de Deploy Netlify - Shark Loterias

Para realizar o deploy na Netlify, siga as diretrizes abaixo:

## 1. Configurações de Build
- **Build Command:** `npm run build`
- **Publish Directory:** `dist/public`

## 2. Dependências Necessárias
A Netlify é uma plataforma para sites estáticos (JAMstack). Como seu projeto possui um backend Express:
- O frontend (Vite) pode ser hospedado na Netlify.
- O backend deve ser convertido para **Netlify Functions** (Serverless) ou hospedado em uma plataforma como **Render**, **Railway** ou o próprio **Replit Deploy**.

## 3. Variáveis de Ambiente
Certifique-se de configurar na Netlify:
- `DATABASE_URL`: URL de conexão do PostgreSQL.
- `JWT_SECRET`: Chave para autenticação.
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Para funcionalidades de IA.

## 4. Estrutura de Arquivos
- Certifique-se de que o arquivo `netlify.toml` exista na raiz para configurar redirecionamentos de SPA:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
