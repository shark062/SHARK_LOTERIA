import memoizee from "memoizee";

export class CacheService {
  private static instance: CacheService;
  
  private constructor() {}

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Memoize functions that perform heavy calculations
   */
  public memoize<T extends (...args: any[]) => any>(fn: T, maxAge = 5 * 60 * 1000): T {
    return memoizee(fn, { 
      maxAge, 
      preFetch: true,
      promise: true,
      async: true
    }) as T;
  }
}

export const cacheService = CacheService.getInstance();
