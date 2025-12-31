/**
 * Utility functions for server operations
 */

/**
 * Retry a database operation with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param baseDelay Base delay in milliseconds
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = i === maxRetries - 1;
      
      if (isLastAttempt) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Retry failed');
}

/**
 * Check if an error is retryable (transient database errors)
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const retryableMessages = [
    'connection',
    'timeout',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'deadlock',
    'lock',
  ];
  
  return retryableMessages.some(msg => 
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}

/**
 * Validate request input against schema
 */
export function validateInput<T>(data: unknown, validator: (d: unknown) => T): T {
  try {
    return validator(data);
  } catch (error) {
    throw new Error(`Invalid input: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
