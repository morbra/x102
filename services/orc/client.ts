// ORC Service Client
// Håndterer HTTP requests til ORC DownBoatRMS API med retry og error handling

import fetch from 'node-fetch';

// ORC API base URL
const ORC_BASE_URL = 'https://data.orc.org/public/WPub.dll';

// Interface for ORC API parametre
interface OrcApiParams {
  action: string;
  ext: string;
  RefNo?: string;
  SailNo?: string;
  YachtName?: string;
  CountryId?: string;
}

// Interface for ORC API response
export interface OrcApiResponse {
  json: any;
  endpoint: string;
  status: number;
  cached: boolean;
}

/**
 * Retry funktion med eksponentiel backoff
 * @param fn - Funktion der skal retry'es
 * @param maxRetries - Maksimal antal retries (default: 3)
 * @param baseDelay - Base delay i millisekunder (default: 1000)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Hvis det er sidste forsøg, kast fejlen
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Beregn delay med eksponentiel backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`ORC API forsøg ${attempt + 1} fejlede, prøver igen om ${delay}ms:`, error);
      
      // Vent før næste forsøg
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Byg ORC API URL fra parametre
 * @param params - ORC API parametre
 * @returns Komplet URL til ORC API
 */
function buildOrcUrl(params: OrcApiParams): string {
  const urlParams = new URLSearchParams();
  
  // Tilføj alle parametre
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      urlParams.set(key, value.toString());
    }
  });
  
  return `${ORC_BASE_URL}?${urlParams.toString()}`;
}

/**
 * Valider ORC request parametre
 * @param req - Request parametre
 * @throws Error hvis parametre er ugyldige
 */
function validateOrcRequest(req: { refNo?: string; sailNo?: string; yachtName?: string; countryId?: string; }): void {
  const hasRefNo = !!req.refNo;
  const hasSailNo = !!req.sailNo;
  const hasYachtName = !!req.yachtName;
  const hasCountryId = !!req.countryId;
  
  // Mindst én identifier skal være givet
  if (!hasRefNo && !hasSailNo && !hasYachtName) {
    throw new Error('Mindst én identifier skal være givet: refNo, sailNo, eller yachtName');
  }
  
  // Hvis kun yachtName er givet, skal countryId også være givet
  if (hasYachtName && !hasCountryId && !hasRefNo && !hasSailNo) {
    throw new Error('countryId skal være givet når yachtName bruges alene');
  }
}

/**
 * Hent ORC data fra DownBoatRMS API
 * @param req - Request parametre
 * @returns Promise med ORC JSON data og metadata
 */
export async function fetchOrcJson(req: { 
  refNo?: string; 
  sailNo?: string; 
  yachtName?: string; 
  countryId?: string; 
}): Promise<OrcApiResponse> {
  // Valider input
  validateOrcRequest(req);
  
  // Byg API parametre
  const params: OrcApiParams = {
    action: 'DownBoatRMS',
    ext: 'json'
  };
  
  // Prioriter refNo hvis tilgængelig
  if (req.refNo) {
    params.RefNo = req.refNo;
  } else {
    // Ellers brug kombination af andre parametre
    if (req.sailNo) params.SailNo = req.sailNo;
    if (req.yachtName) params.YachtName = req.yachtName;
    if (req.countryId) params.CountryId = req.countryId;
  }
  
  const url = buildOrcUrl(params);
  
  console.log(`Henter ORC data fra: ${url}`);
  
  // Fetch med retry
  const response = await withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sekunder timeout
    
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ORC-Service/1.0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`ORC API HTTP ${res.status}: ${res.statusText}`);
      }
      
      return res;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
  
  // Parse JSON response
  let json: any;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error(`Kunne ikke parse ORC JSON response: ${error}`);
  }
  
  // Valider at vi fik noget data
  if (!json || typeof json !== 'object') {
    throw new Error('ORC API returnerede tom eller ugyldig JSON');
  }
  
  return {
    json,
    endpoint: url,
    status: response.status,
    cached: false
  };
}

/**
 * Test ORC API connectivity
 * @returns Promise med test resultat
 */
export async function testOrcConnectivity(): Promise<{ success: boolean; error?: string; responseTime?: number }> {
  const startTime = Date.now();
  
  try {
    // Test med et kendt refNo (X-102)
    const response = await fetchOrcJson({ refNo: '034200028W9' });
    const responseTime = Date.now() - startTime;
    
    return {
      success: true,
      responseTime
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ukendt fejl'
    };
  }
}
