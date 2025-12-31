
/**
 * 🚀 ML OPS - Sistema de Gerenciamento de Modelos e Experimentos
 */

interface ExperimentConfig {
  id: string;
  name: string;
  modelType: string;
  hyperparameters: Record<string, any>;
  dataVersion: string;
  timestamp: Date;
}

interface ExperimentResult {
  experimentId: string;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    sharpeRatio?: number;
    profitFactor?: number;
  };
  predictions: number[][];
  backtestResults?: any;
}

interface ModelVersion {
  version: string;
  experimentId: string;
  status: 'development' | 'staging' | 'production' | 'archived';
  performance: Record<string, number>;
  createdAt: Date;
  promotedAt?: Date;
}

export class MLOpsService {
  private experiments: Map<string, ExperimentConfig> = new Map();
  private results: Map<string, ExperimentResult> = new Map();
  private models: Map<string, ModelVersion> = new Map();

  /**
   * Registrar novo experimento
   */
  registerExperiment(config: Omit<ExperimentConfig, 'id' | 'timestamp'>): string {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const experiment: ExperimentConfig = {
      id,
      timestamp: new Date(),
      ...config
    };

    this.experiments.set(id, experiment);
    
    console.log(`📊 Experimento registrado: ${id} - ${config.name}`);
    return id;
  }

  /**
   * Registrar resultados do experimento
   */
  logResults(experimentId: string, results: Omit<ExperimentResult, 'experimentId'>): void {
    const experiment = this.experiments.get(experimentId);
    
    if (!experiment) {
      throw new Error(`Experimento não encontrado: ${experimentId}`);
    }

    this.results.set(experimentId, {
      experimentId,
      ...results
    });

    console.log(`✅ Resultados registrados para ${experimentId}`);
    console.log(`   Accuracy: ${(results.metrics.accuracy * 100).toFixed(2)}%`);
  }

  /**
   * Promover modelo para produção
   */
  promoteModel(experimentId: string): void {
    const result = this.results.get(experimentId);
    const experiment = this.experiments.get(experimentId);

    if (!result || !experiment) {
      throw new Error('Experimento ou resultados não encontrados');
    }

    // Arquivar modelo de produção atual
    this.models.forEach((model) => {
      if (model.status === 'production') {
        model.status = 'archived';
      }
    });

    // Criar nova versão
    const version = `v${Date.now()}`;
    const modelVersion: ModelVersion = {
      version,
      experimentId,
      status: 'production',
      performance: result.metrics,
      createdAt: experiment.timestamp,
      promotedAt: new Date()
    };

    this.models.set(version, modelVersion);
    
    console.log(`🚀 Modelo ${version} promovido para produção`);
  }

  /**
   * Comparar experimentos
   */
  compareExperiments(experimentIds: string[]): Array<{
    id: string;
    name: string;
    metrics: Record<string, number>;
    ranking: number;
  }> {
    const comparisons = experimentIds
      .map(id => {
        const exp = this.experiments.get(id);
        const result = this.results.get(id);
        
        if (!exp || !result) return null;

        return {
          id,
          name: exp.name,
          metrics: result.metrics,
          ranking: 0 // Será calculado
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        name: string;
        metrics: Record<string, number>;
        ranking: number;
      }>;

    // Calcular ranking baseado em accuracy
    comparisons.sort((a, b) => b.metrics.accuracy - a.metrics.accuracy);
    comparisons.forEach((comp, index) => {
      comp.ranking = index + 1;
    });

    return comparisons;
  }

  /**
   * Obter modelo em produção
   */
  getProductionModel(): ModelVersion | null {
    for (const [, model] of this.models) {
      if (model.status === 'production') {
        return model;
      }
    }
    return null;
  }

  /**
   * Análise de data leakage
   */
  checkDataLeakage(trainingData: any[], testData: any[]): {
    hasLeakage: boolean;
    leakageRate: number;
    details: string[];
  } {
    const details: string[] = [];
    let leakageCount = 0;

    // Verificar sobreposição temporal
    const trainDates = new Set(trainingData.map(d => d.drawDate));
    const testDates = new Set(testData.map(d => d.drawDate));

    testData.forEach(test => {
      if (trainDates.has(test.drawDate)) {
        leakageCount++;
        details.push(`Sorteio ${test.contestNumber} presente em ambos os conjuntos`);
      }
    });

    // Verificar se dados de teste são anteriores ao treino
    const maxTrainDate = Math.max(...trainingData.map(d => new Date(d.drawDate).getTime()));
    const minTestDate = Math.min(...testData.map(d => new Date(d.drawDate).getTime()));

    if (minTestDate < maxTrainDate) {
      details.push('⚠️ Dados de teste contêm datas anteriores ao treino');
    }

    const leakageRate = testData.length > 0 ? leakageCount / testData.length : 0;

    return {
      hasLeakage: leakageCount > 0 || minTestDate < maxTrainDate,
      leakageRate,
      details
    };
  }

  /**
   * Exportar experimentos para análise
   */
  exportExperiments(): string {
    const data = {
      experiments: Array.from(this.experiments.values()),
      results: Array.from(this.results.values()),
      models: Array.from(this.models.values()),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }
}

export const mlOpsService = new MLOpsService();
