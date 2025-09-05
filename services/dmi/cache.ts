import crypto from 'crypto';

// Interface for cache entry
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live i millisekunder
}

// Interface for cache parametre
interface CacheParams {
  lat: number;
  lon: number;
  whenISO?: string; // For backward compatibility
  fromwhenISO?: string; // For interval requests
  towhenISO?: string; // For interval requests
  collection?: string;
}

/**
 * Simpel in-memory cache for DMI API data
 * Bruger hash af parametre som nøgle og TTL på 5 minutter
 */
class DmiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutter i millisekunder

  /**
   * Genererer hash nøgle fra cache parametre
   * @param params - Cache parametre
   * @returns Hash nøgle som string
   */
  private generateKey(params: CacheParams): string {
    // Byg string fra parametre for at skabe unik nøgle
    let keyString: string;
    
    if (params.fromwhenISO && params.towhenISO) {
      // For interval requests
      keyString = `${params.lat},${params.lon},${params.fromwhenISO},${params.towhenISO},${params.collection || 'all'}`;
    } else if (params.whenISO) {
      // For single point requests (backward compatibility)
      keyString = `${params.lat},${params.lon},${params.whenISO},${params.collection || 'all'}`;
    } else {
      throw new Error('Cache params skal have enten whenISO eller fromwhenISO/towhenISO');
    }
    
    // Generer SHA-256 hash for at få konsistent nøgle
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Tjekker om cache entry er gyldig (ikke udløbet)
   * @param entry - Cache entry
   * @returns true hvis entry er gyldig
   */
  private isValid(entry: CacheEntry<any>): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < entry.ttl;
  }

  /**
   * Henter data fra cache
   * @param params - Cache parametre
   * @returns Cached data eller null hvis ikke fundet/udløbet
   */
  get<T>(params: CacheParams): T | null {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Tjek om entry er udløbet
    if (!this.isValid(entry)) {
      // Fjern udløbet entry
      this.cache.delete(key);
      return null;
    }

    console.log(`Cache hit for nøgle: ${key.substring(0, 8)}...`);
    return entry.data;
  }

  /**
   * Gemmer data i cache
   * @param params - Cache parametre
   * @param data - Data der skal gemmes
   * @param ttl - Time to live i millisekunder (valgfrit, default 5 min)
   */
  set<T>(params: CacheParams, data: T, ttl?: number): void {
    const key = this.generateKey(params);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    };

    this.cache.set(key, entry);
    console.log(`Cache set for nøgle: ${key.substring(0, 8)}... (TTL: ${entry.ttl}ms)`);
  }

  /**
   * Fjerner specifik cache entry
   * @param params - Cache parametre
   */
  delete(params: CacheParams): void {
    const key = this.generateKey(params);
    this.cache.delete(key);
    console.log(`Cache deleted for nøgle: ${key.substring(0, 8)}...`);
  }

  /**
   * Rydder alle udløbne cache entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cache cleanup: fjernede ${cleanedCount} udløbne entries`);
    }
  }

  /**
   * Rydder hele cachen
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`Cache cleared: fjernede ${size} entries`);
  }

  /**
   * Henter cache statistikker
   * @returns Objekt med cache statistikker
   */
  getStats(): {
    size: number;
    validEntries: number;
    expiredEntries: number;
  } {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      if (this.isValid(entry)) {
        validCount++;
      } else {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount
    };
  }

  /**
   * Starter automatisk cleanup timer
   * Kører cleanup hver 2. minut
   */
  startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, 2 * 60 * 1000); // Hver 2. minut

    console.log('Cache cleanup timer startet (hver 2. minut)');
  }
}

// Eksporter singleton instance
export const dmiCache = new DmiCache();

// Start automatisk cleanup ved import
dmiCache.startCleanupTimer();
