// ORC Service Router
// API routes for ORC optimal beregninger

import { Router, Request, Response } from 'express';
import { optimal, getCacheStats, clearCache, testConnectivity } from './index';
import { OptimalRequest } from './types';

const router = Router();

// Interface for optimal query parametre
interface OptimalQuery {
  tws: string;
  refNo?: string;
  sailNo?: string;
  yachtName?: string;
  countryId?: string;
}

/**
 * Valider og parse query parametre
 * @param query - Raw query objekt
 * @returns Parsed og valideret parametre
 */
function validateAndParseQuery(query: any): OptimalRequest {
  const { tws, refNo, sailNo, yachtName, countryId } = query as OptimalQuery;
  
  // Valider TWS
  if (!tws) {
    throw new Error('tws parameter er påkrævet');
  }
  
  const twsNum = parseFloat(tws);
  if (isNaN(twsNum) || twsNum <= 0) {
    throw new Error('tws skal være et positivt tal');
  }
  
  if (twsNum < 2 || twsNum > 50) {
    throw new Error('tws skal være mellem 2 og 50 knob');
  }
  
  // Valider at mindst én identifier er givet
  if (!refNo && !sailNo && !yachtName) {
    throw new Error('Mindst én identifier skal være givet: refNo, sailNo, eller yachtName');
  }
  
  // Hvis yachtName er givet uden andre identifiers, skal countryId også være givet
  if (yachtName && !countryId && !refNo && !sailNo) {
    throw new Error('countryId skal være givet når yachtName bruges alene');
  }
  
  return {
    tws: twsNum,
    refNo: refNo?.trim(),
    sailNo: sailNo?.trim(),
    yachtName: yachtName?.trim(),
    countryId: countryId?.trim()
  };
}

/**
 * GET /api/orc/optimal
 * Beregn optimale sejlvinkler og hastigheder
 */
router.get('/optimal', async (req: Request, res: Response) => {
  try {
    console.log('ORC optimal request:', req.query);
    
    // Valider og parse query parametre
    const request = validateAndParseQuery(req.query);
    
    // Beregn optimale vinkler
    const result = await optimal(request);
    
    console.log(`ORC optimal response: upwind=${result.upwind.twa_deg}°/${result.upwind.vmg_kt}kt, downwind=${result.downwind.twa_deg}°/${result.downwind.vmg_kt}kt`);
    
    res.json(result);
    
  } catch (error) {
    console.error('ORC optimal fejl:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('parameter') || error.message.includes('identifier')) {
        res.status(400).json({ 
          error: 'Ugyldig request', 
          message: error.message 
        });
      } else if (error.message.includes('Mangler tilstrækkelige data')) {
        res.status(404).json({ 
          error: 'Båd ikke fundet', 
          message: 'Kunne ikke finde ORC data for den angivne båd' 
        });
      } else if (error.message.includes('ORC API')) {
        res.status(502).json({ 
          error: 'ORC API fejl', 
          message: 'Kunne ikke hente data fra ORC API' 
        });
      } else {
        res.status(500).json({ 
          error: 'Server fejl', 
          message: 'Intern server fejl' 
        });
      }
    } else {
      res.status(500).json({ 
        error: 'Ukendt fejl', 
        message: 'En ukendt fejl opstod' 
      });
    }
  }
});

/**
 * GET /api/orc/health
 * Health check og cache statistikker
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const cacheStats = getCacheStats();
    const connectivity = await testConnectivity();
    
    res.json({
      status: 'ok',
      service: 'ORC',
      cache: cacheStats,
      connectivity,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('ORC health check fejl:', error);
    res.status(500).json({
      status: 'error',
      service: 'ORC',
      error: error instanceof Error ? error.message : 'Ukendt fejl',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/orc/cache/clear
 * Ryd ORC cache
 */
router.post('/cache/clear', (req: Request, res: Response) => {
  try {
    clearCache();
    res.json({
      message: 'ORC cache ryddet',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ORC cache clear fejl:', error);
    res.status(500).json({
      error: 'Kunne ikke rydde cache',
      message: error instanceof Error ? error.message : 'Ukendt fejl'
    });
  }
});

/**
 * GET /api/orc/cache/stats
 * Hent cache statistikker
 */
router.get('/cache/stats', (req: Request, res: Response) => {
  try {
    const stats = getCacheStats();
    res.json({
      cache: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('ORC cache stats fejl:', error);
    res.status(500).json({
      error: 'Kunne ikke hente cache statistikker',
      message: error instanceof Error ? error.message : 'Ukendt fejl'
    });
  }
});

export default router;
