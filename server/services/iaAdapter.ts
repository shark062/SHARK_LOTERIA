
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

interface IAResponse {
  provider: string;
  success: boolean;
  raw: string;
  parsed?: any;
  latency: number;
  confidence?: number;
}

export class IAAdapter {
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private anthropic: Anthropic;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async callProvider(provider: string, prompt: string, options: any = {}): Promise<IAResponse> {
    const start = Date.now();
    
    try {
      let response: string;

      switch (provider) {
        case 'openai':
          response = await this.callOpenAI(prompt, options);
          break;
        case 'gemini':
          response = await this.callGemini(prompt, options);
          break;
        case 'anthropic':
          response = await this.callAnthropic(prompt, options);
          break;
        case 'deepseek':
          response = await this.callDeepSeek(prompt, options);
          break;
        default:
          throw new Error(`Provider desconhecido: ${provider}`);
      }

      const latency = Date.now() - start;
      
      return {
        provider,
        success: true,
        raw: response,
        parsed: this.tryParseJSON(response),
        latency
      };
    } catch (error: any) {
      return {
        provider,
        success: false,
        raw: error.message || 'Erro desconhecido',
        latency: Date.now() - start
      };
    }
  }

  private async callOpenAI(prompt: string, options: any): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000
    });

    return response.choices[0]?.message?.content || '';
  }

  private async callGemini(prompt: string, options: any): Promise<string> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  private async callAnthropic(prompt: string, options: any): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: options.maxTokens || 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  private async callDeepSeek(prompt: string, options: any): Promise<string> {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7
      })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async callAllIAs(prompt: string, options: any = {}): Promise<IAResponse[]> {
    const providers = ['openai', 'gemini', 'anthropic', 'deepseek'];
    const promises = providers.map(p => this.callProvider(p, prompt, options));
    return Promise.all(promises);
  }

  private tryParseJSON(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

export const iaAdapter = new IAAdapter();
