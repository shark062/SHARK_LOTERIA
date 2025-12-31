
/**
 * Sistema de fila para serializar mensagens por sessão
 * Evita race conditions e processamento concorrente
 */

interface QueueTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

class ConversationQueue {
  private sessionQueues: Map<string, Promise<any>> = new Map();

  /**
   * Enfileira uma tarefa para execução sequencial por sessão
   */
  async enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const lastTask = this.sessionQueues.get(sessionId) || Promise.resolve();
    
    let resolveNext: () => void;
    const nextTask = new Promise<void>(resolve => resolveNext = resolve);
    
    const wrappedTask = lastTask
      .then(() => task())
      .finally(() => {
        resolveNext!();
        // Limpa a fila se esta for a última tarefa
        if (this.sessionQueues.get(sessionId) === nextTask) {
          this.sessionQueues.delete(sessionId);
        }
      });
    
    this.sessionQueues.set(sessionId, nextTask);
    return wrappedTask;
  }

  /**
   * Verifica se há tarefas pendentes para uma sessão
   */
  hasPending(sessionId: string): boolean {
    return this.sessionQueues.has(sessionId);
  }

  /**
   * Limpa todas as filas (útil para testes)
   */
  clear() {
    this.sessionQueues.clear();
  }
}

export const conversationQueue = new ConversationQueue();
