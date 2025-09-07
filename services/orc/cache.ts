// ORC Service Cache
// LRU cache implementation med TTL for ORC data

import { CacheEntry } from './types';

export interface CacheLike<T> {
  get(key: string): T | undefined;
  set(key: string, val: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

/**
 * LRU Cache implementation med TTL
 * @param max - Maksimal antal entries (default: 100)
 * @param ttlMs - Time to live i millisekunder (default: 24 timer)
 */
export const makeLRU = <T>(max = 100, ttlMs = 24 * 60 * 60 * 1000): CacheLike<T> => {
  const map = new Map<string, { value: T; timestamp: number }>();
  
  return {
    get(k: string): T | undefined {
      const entry = map.get(k);
      if (!entry) return undefined;
      
      // Tjek TTL
      if (Date.now() - entry.timestamp > ttlMs) {
        map.delete(k);
        return undefined;
      }
      
      // Flyt til slut (LRU)
      map.delete(k);
      map.set(k, entry);
      return entry.value;
    },
    
    set(k: string, v: T): void {
      // Fjern eksisterende entry hvis den findes
      if (map.has(k)) {
        map.delete(k);
      }
      
      // Tilføj ny entry
      map.set(k, { value: v, timestamp: Date.now() });
      
      // Fjern ældste hvis vi overstiger max
      if (map.size > max) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) {
          map.delete(firstKey);
        }
      }
    },
    
    has(k: string): boolean {
      const entry = map.get(k);
      if (!entry) return false;
      
      // Tjek TTL
      if (Date.now() - entry.timestamp > ttlMs) {
        map.delete(k);
        return false;
      }
      
      return true;
    },
    
    delete(k: string): boolean {
      return map.delete(k);
    },
    
    clear(): void {
      map.clear();
    },
    
    size(): number {
      return map.size;
    }
  };
};

/**
 * Generer cache key fra request parametre
 * Prioriterer refNo > countryId|sailNo > yachtName
 */
export function generateCacheKey(req: { refNo?: string; sailNo?: string; yachtName?: string; countryId?: string; }): string {
  if (req.refNo) {
    return `ref:${req.refNo.toLowerCase()}`;
  }
  
  if (req.countryId && req.sailNo) {
    return `sail:${req.countryId.toLowerCase()}|${req.sailNo.toLowerCase()}`;
  }
  
  if (req.yachtName) {
    return `name:${req.yachtName.trim().toLowerCase()}`;
  }
  
  return '';
}

/**
 * Cache statistikker
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
}

/**
 * Cache med statistikker
 */
export class OrcCache {
  private cache: CacheLike<CacheEntry>;
  private hits = 0;
  private misses = 0;
  
  constructor(maxSize = 100, ttlMs = 24 * 60 * 60 * 1000) {
    this.cache = makeLRU<CacheEntry>(maxSize, ttlMs);
  }
  
  get(key: string): CacheEntry | undefined {
    const result = this.cache.get(key);
    if (result) {
      this.hits++;
    } else {
      this.misses++;
    }
    return result;
  }
  
  set(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }
  
  has(key: string): boolean {
    return this.cache.has(key);
  }
  
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size(),
      maxSize: 100, // hardcoded for nu
      hitRate: total > 0 ? this.hits / total : 0,
      totalHits: this.hits,
      totalMisses: this.misses
    };
  }
}
