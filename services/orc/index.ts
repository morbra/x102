// ORC Service Main Entry Point
// Eksponerer optimal funktion og håndterer cache og API calls

import { fetchOrcJson } from './client';
import { OrcCache, generateCacheKey } from './cache';
import { parsePolarFromOrcJson, computeOptimal } from './polar';
import { OptimalRequest, OptimalResponse } from './types';

// Global cache instance
const cache = new OrcCache(100, 24 * 60 * 60 * 1000); // 100 entries, 24 timer TTL

/**
 * Valider optimal request
 * @param req - Request objekt
 * @throws Error hvis request er ugyldig
 */
function validateOptimalRequest(req: any): asserts req is OptimalRequest {
  if (!req || typeof req !== 'object') {
    throw new Error('Request skal være et objekt');
  }
  
  if (typeof req.tws !== 'number' || req.tws <= 0) {
    throw new Error('tws skal være et positivt tal');
  }
  
  if (req.tws < 2 || req.tws > 50) {
    throw new Error('tws skal være mellem 2 og 50 knob');
  }
  
  const hasRefNo = !!req.refNo;
  const hasSailNo = !!req.sailNo;
  const hasYachtName = !!req.yachtName;
  const hasCountryId = !!req.countryId;
  
  if (!hasRefNo && !hasSailNo && !hasYachtName) {
    throw new Error('Mindst én identifier skal være givet: refNo, sailNo, eller yachtName');
  }
  
  if (hasYachtName && !hasCountryId && !hasRefNo && !hasSailNo) {
    throw new Error('countryId skal være givet når yachtName bruges alene');
  }
}

/**
 * Hent ORC data (cache eller API)
 * @param req - Request parametre
 * @returns Cache entry med ORC data
 */
async function getOrcData(req: OptimalRequest): Promise<{ 
  json: any; 
  polar: any; 
  fetchedAt: string; 
  endpoint: string; 
  cached: boolean; 
}> {
  const cacheKey = generateCacheKey(req);
  
  // Tjek cache først
  if (cacheKey && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`ORC data fundet i cache for key: ${cacheKey}`);
      return {
        ...cached,
        endpoint: 'cache',
        cached: true
      };
    }
  }
  
  // Hent fra API
  console.log(`Henter ORC data fra API for: ${JSON.stringify(req)}`);
  const { json, endpoint } = await fetchOrcJson(req);
  
  // Parse polar data
  const polar = parsePolarFromOrcJson(json);
  
  // Gem i cache
  const entry = {
    json,
    polar,
    fetchedAt: new Date().toISOString()
  };
  
  if (cacheKey) {
    cache.set(cacheKey, entry);
    console.log(`ORC data gemt i cache med key: ${cacheKey}`);
  }
  
  return {
    ...entry,
    endpoint,
    cached: false
  };
}

/**
 * Hovedfunktion: Beregn optimale sejlvinkler og hastigheder
 * @param req - Request parametre
 * @returns Optimal response med upwind, downwind og reaching data
 */
export async function optimal(req: OptimalRequest): Promise<OptimalResponse> {
  try {
    // Valider request
    validateOptimalRequest(req);
    
    console.log(`Beregner optimale vinkler for TWS=${req.tws}, identifiers=${JSON.stringify({
      refNo: req.refNo,
      sailNo: req.sailNo,
      yachtName: req.yachtName,
      countryId: req.countryId
    })}`);
    
    // Hent ORC data
    const { json, polar, fetchedAt, endpoint, cached } = await getOrcData(req);
    
    // Beregn optimale vinkler
    const { up, dn, reaching, notes } = computeOptimal(polar, req.tws);
    
    // Byg response
    const response: OptimalResponse = {
      boatId: {
        refNo: req.refNo,
        sailNo: req.sailNo,
        yachtName: req.yachtName,
        countryId: req.countryId
      },
      tws: req.tws,
      upwind: {
        twa_deg: up.twa,
        vmg_kt: up.vmg,
        target_bs_kt: up.bs
      },
      downwind: {
        twa_deg: dn.twa,
        vmg_kt: dn.vmg,
        target_bs_kt: dn.bs
      },
      reaching,
      source: {
        cached,
        fetchedAt,
        endpoint,
        notes: notes.length > 0 ? notes.join('; ') : undefined
      }
    };
    
    console.log(`Optimal beregning færdig: upwind=${up.twa}°/${up.vmg}kt, downwind=${dn.twa}°/${dn.vmg}kt, reaching=${Object.keys(reaching).length} vinkler`);
    
    return response;
    
  } catch (error) {
    console.error('Fejl ved ORC optimal beregning:', error);
    throw error;
  }
}

/**
 * Hent cache statistikker
 * @returns Cache statistikker
 */
export function getCacheStats() {
  return cache.getStats();
}

/**
 * Ryd cache
 */
export function clearCache() {
  cache.clear();
  console.log('ORC cache ryddet');
}

/**
 * Test ORC service connectivity
 * @returns Test resultat
 */
export async function testConnectivity() {
  try {
    const { testOrcConnectivity } = await import('./client');
    return await testOrcConnectivity();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ukendt fejl'
    };
  }
}

// Eksporter typer for brug i andre moduler
export type { OptimalRequest, OptimalResponse, ReachingMap, ReachingEntry } from './types';
