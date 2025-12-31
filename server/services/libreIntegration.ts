
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

interface ChatResponse {
  message: string;
  model: string;
  tokens?: number;
  cost?: number;
}

/**
 * Motor de Chat Híbrido inspirado no Libre-Chat
 * Suporta múltiplos provedores de IA com fallback automático
 */
class LibreChatEngine {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private groq: Groq | null = null;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor() {
    // Inicializar clientes disponíveis
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    if (process.env.GROQ_API_KEY) {
      this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
  }

  /**
   * Sistema de prompt inteligente para contexto de loterias
   */
  private buildSystemPrompt(persona: string, context: any): string {
    const basePrompt = `Você é um assistente especializado em análise de loterias brasileiras.
Seu nome é Shark AI e você ajuda usuários a tomar decisões inteligentes sobre jogos.

Você tem acesso a:
- Histórico de sorteios e padrões estatísticos
- Análises de IA multi-modelo
- Predições baseadas em machine learning
- Estratégias comprovadas de apostas

Contexto atual:
- Loteria: ${context?.lotteryId || 'Todas'}
- Últimos sorteios analisados: ${context?.recentDraws || 'Carregando...'}

`;

    const personaPrompts = {
      analista: `Tom: Técnico, educado e analítico. Foque em dados e estatísticas.`,
      lek_do_black: `Tom: Agressivo, direto, estilo rua. Use gírias e seja persuasivo.
Exemplos: "E AÍ MEU CRIA!", "VAI SER GOLPE DIRETO!", "BORA LUCRAR!"`,
      coach: `Tom: Motivacional e estratégico. Inspire confiança e discipline.`
    };

    return basePrompt + (personaPrompts[persona as keyof typeof personaPrompts] || personaPrompts.analista);
  }

  /**
   * Chat com OpenAI (GPT-4)
   */
  private async chatWithOpenAI(
    messages: ChatMessage[],
    systemPrompt: string
  ): Promise<ChatResponse> {
    if (!this.openai) throw new Error('OpenAI não configurado');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    return {
      message: response.choices[0].message.content || '',
      model: 'gpt-4o-mini',
      tokens: response.usage?.total_tokens,
      cost: (response.usage?.total_tokens || 0) * 0.00015 / 1000
    };
  }

  /**
   * Chat com Anthropic (Claude)
   */
  private async chatWithAnthropic(
    messages: ChatMessage[],
    systemPrompt: string
  ): Promise<ChatResponse> {
    if (!this.anthropic) throw new Error('Anthropic não configurado');

    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
    });

    const content = response.content[0];
    return {
      message: content.type === 'text' ? content.text : '',
      model: 'claude-3-5-sonnet',
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      cost: (response.usage.input_tokens * 0.003 + response.usage.output_tokens * 0.015) / 1000
    };
  }

  /**
   * Chat com Groq (Llama/Mixtral ultrarrápido)
   */
  private async chatWithGroq(
    messages: ChatMessage[],
    systemPrompt: string
  ): Promise<ChatResponse> {
    if (!this.groq) throw new Error('Groq não configurado');

    const response = await this.groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    return {
      message: response.choices[0].message.content || '',
      model: 'llama-3.1-70b',
      tokens: response.usage?.total_tokens,
      cost: 0 // Groq é gratuito
    };
  }

  /**
   * Chat inteligente com fallback automático
   */
  async chat(
    sessionId: string,
    userMessage: string,
    persona: string = 'analista',
    context: any = {}
  ): Promise<ChatResponse> {
    // Gerenciar histórico de conversação
    if (!this.conversationHistory.has(sessionId)) {
      this.conversationHistory.set(sessionId, []);
    }

    const history = this.conversationHistory.get(sessionId)!;
    history.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    // Limitar histórico a 20 mensagens
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    const systemPrompt = this.buildSystemPrompt(persona, context);

    // Tentar provedores em ordem de preferência (velocidade/custo)
    const providers = [
      { name: 'Groq', fn: () => this.chatWithGroq(history, systemPrompt) },
      { name: 'OpenAI', fn: () => this.chatWithOpenAI(history, systemPrompt) },
      { name: 'Anthropic', fn: () => this.chatWithAnthropic(history, systemPrompt) }
    ];

    for (const provider of providers) {
      try {
        const response = await provider.fn();
        
        // Adicionar resposta ao histórico
        history.push({
          role: 'assistant',
          content: response.message,
          timestamp: new Date()
        });

        console.log(`✅ Chat via ${provider.name} - ${response.tokens} tokens - $${response.cost?.toFixed(4) || '0'}`);
        return response;
      } catch (error: any) {
        console.warn(`⚠️ ${provider.name} falhou:`, error.message);
        continue;
      }
    }

    throw new Error('Nenhum provedor de IA disponível');
  }

  /**
   * Streaming de resposta (para UX mais fluida)
   */
  async *streamChat(
    sessionId: string,
    userMessage: string,
    persona: string = 'analista',
    context: any = {}
  ): AsyncGenerator<string> {
    if (!this.openai) {
      yield (await this.chat(sessionId, userMessage, persona, context)).message;
      return;
    }

    const history = this.conversationHistory.get(sessionId) || [];
    const systemPrompt = this.buildSystemPrompt(persona, context);

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      stream: true
    });

    let fullMessage = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullMessage += content;
      yield content;
    }

    // Salvar no histórico
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: fullMessage });
  }

  /**
   * Limpar histórico de sessão
   */
  clearHistory(sessionId: string) {
    this.conversationHistory.delete(sessionId);
  }
}

export const libreChatEngine = new LibreChatEngine();
