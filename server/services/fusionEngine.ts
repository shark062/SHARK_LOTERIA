
interface FusionResult {
  consensusResponse: string;
  confidence: number;
  providers: string[];
  riskScore: number;
  metadata: any;
}

export class FusionEngine {
  /**
   * Funde respostas das múltiplas IAs
   */
  async fuse(responses: any[]): Promise<FusionResult> {
    const successful = responses.filter(r => r.success);
    
    if (successful.length === 0) {
      return {
        consensusResponse: 'Nenhuma IA respondeu com sucesso',
        confidence: 0,
        providers: [],
        riskScore: 1.0,
        metadata: {}
      };
    }

    // Extrai respostas parseadas
    const parsed = successful
      .map(r => r.parsed)
      .filter(p => p !== null);

    // Calcula consenso
    const consensus = this.calculateConsensus(parsed);
    
    // Calcula confiança baseada em concordância
    const confidence = this.calculateConfidence(successful, parsed);
    
    // Calcula risco
    const riskScore = this.calculateRiskScore(parsed, confidence);

    return {
      consensusResponse: consensus.response || successful[0].raw,
      confidence,
      providers: successful.map(r => r.provider),
      riskScore,
      metadata: {
        totalResponses: responses.length,
        successfulResponses: successful.length,
        avgLatency: successful.reduce((sum, r) => sum + r.latency, 0) / successful.length,
        consensus
      }
    };
  }

  private calculateConsensus(parsed: any[]): any {
    if (parsed.length === 0) return {};

    // Para patches: encontra o mais comum
    if (parsed[0]?.patch) {
      const patchCounts = new Map<string, number>();
      
      parsed.forEach(p => {
        const key = p.patch?.substring(0, 100) || '';
        patchCounts.set(key, (patchCounts.get(key) || 0) + 1);
      });

      const mostCommon = Array.from(patchCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];

      return parsed.find(p => p.patch?.substring(0, 100) === mostCommon[0]) || parsed[0];
    }

    // Para análises: merge de insights
    return this.mergeInsights(parsed);
  }

  private mergeInsights(parsed: any[]): any {
    const merged: any = {
      hypothesis: [],
      recommendations: [],
      confidence: 0
    };

    parsed.forEach(p => {
      if (p.hypothesis) merged.hypothesis.push(p.hypothesis);
      if (p.recommendations) merged.recommendations.push(...(p.recommendations || []));
      if (p.confidence) merged.confidence += p.confidence;
    });

    merged.confidence = merged.confidence / parsed.length;

    return merged;
  }

  private calculateConfidence(responses: any[], parsed: any[]): number {
    // Confiança baseada em:
    // 1. Taxa de sucesso
    // 2. Concordância entre respostas
    // 3. Confiança individual das IAs

    const successRate = responses.filter(r => r.success).length / responses.length;
    const agreementScore = this.calculateAgreement(parsed);
    const avgConfidence = parsed.reduce((sum, p) => sum + (p.confidence || 0.5), 0) / (parsed.length || 1);

    return (successRate * 0.3 + agreementScore * 0.4 + avgConfidence * 0.3);
  }

  private calculateAgreement(parsed: any[]): number {
    if (parsed.length < 2) return 1.0;

    // Compara patches ou respostas
    let agreements = 0;
    let comparisons = 0;

    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        comparisons++;
        if (this.areSimilar(parsed[i], parsed[j])) {
          agreements++;
        }
      }
    }

    return comparisons > 0 ? agreements / comparisons : 0.5;
  }

  private areSimilar(a: any, b: any): boolean {
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    
    // Similaridade básica por substring
    const common = this.longestCommonSubstring(aStr, bStr);
    const maxLen = Math.max(aStr.length, bStr.length);
    
    return (common.length / maxLen) > 0.6;
  }

  private longestCommonSubstring(s1: string, s2: string): string {
    const m = s1.length;
    const n = s2.length;
    let maxLen = 0;
    let endIndex = 0;

    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
          if (dp[i][j] > maxLen) {
            maxLen = dp[i][j];
            endIndex = i;
          }
        }
      }
    }

    return s1.substring(endIndex - maxLen, endIndex);
  }

  private calculateRiskScore(parsed: any[], confidence: number): number {
    // Risco inversamente proporcional à confiança
    let risk = 1 - confidence;

    // Aumenta risco se há muitas mudanças
    const avgChanges = parsed.reduce((sum, p) => {
      const changes = (p.patch?.split('\n') || []).filter((l: string) => l.startsWith('+') || l.startsWith('-')).length;
      return sum + changes;
    }, 0) / (parsed.length || 1);

    if (avgChanges > 50) risk += 0.2;
    if (avgChanges > 100) risk += 0.3;

    return Math.min(risk, 1.0);
  }
}

export const fusionEngine = new FusionEngine();
