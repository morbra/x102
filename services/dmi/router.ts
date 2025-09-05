import { Router, Request, Response } from 'express';
import { getDmiPoint, getDmiInterval } from './dmiClient';
import { dmiCache } from './cache';

// Opret Express router
const router = Router();

// Interface for query parametre
interface PointQuery {
  lat: string;
  lon: string;
  fromwhen?: string;
  towhen?: string;
}

/**
 * Validerer og parser query parametre
 * @param query - Express query objekt
 * @returns Validerede parametre eller kaster fejl
 */
function validateAndParseQuery(query: any): { lat: number; lon: number; fromwhenISO: string; towhenISO: string } {
  // Tjek at lat og lon er til stede
  if (!query.lat || !query.lon) {
    throw new Error('Manglende parametre: lat og lon er påkrævet');
  }

  // Parse og valider lat
  const lat = parseFloat(query.lat);
  if (isNaN(lat)) {
    throw new Error('Ugyldig lat: skal være et tal');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Ugyldig lat: skal være mellem -90 og 90');
  }

  // Parse og valider lon
  const lon = parseFloat(query.lon);
  if (isNaN(lon)) {
    throw new Error('Ugyldig lon: skal være et tal');
  }
  if (lon < -180 || lon > 180) {
    throw new Error('Ugyldig lon: skal være mellem -180 og 180');
  }

  // Parse tidsinterval parametre
  let fromwhenISO: string, towhenISO: string;
  
  if (query.fromwhen && query.towhen) {
    // Brug fromwhen og towhen hvis begge er angivet
    const fromDate = new Date(query.fromwhen);
    const toDate = new Date(query.towhen);
    
    if (isNaN(fromDate.getTime())) {
      throw new Error('Ugyldig fromwhen: skal være gyldig ISO dato/tid');
    }
    if (isNaN(toDate.getTime())) {
      throw new Error('Ugyldig towhen: skal være gyldig ISO dato/tid');
    }
    if (fromDate >= toDate) {
      throw new Error('fromwhen skal være før towhen');
    }
    
    fromwhenISO = fromDate.toISOString();
    towhenISO = toDate.toISOString();
  } else {
    // Brug nuværende tid hvis ingen parametre er angivet (default: now + 3 timer)
    const now = new Date();
    fromwhenISO = now.toISOString();
    towhenISO = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(); // +3 timer
  }

  return { lat, lon, fromwhenISO, towhenISO };
}

/**
 * GET /api/dmi/forecast - Henter vind og bølgedata for et punkt
 * Query parametre:
 * - lat: Breddegrad (påkrævet)
 * - lon: Længdegrad (påkrævet)  
 * - fromwhen: Start tidspunkt (valgfrit, kræver towhen)
 * - towhen: Slut tidspunkt (valgfrit, kræver fromwhen)
 * - Default: nu til nu + 3 timer hvis ingen tidsinterval angives
 */
router.get('/forecast', async (req: Request, res: Response) => {
  try {
    console.log(`DMI forecast request: ${JSON.stringify(req.query)}`);

    // Valider og parse query parametre
    const { lat, lon, fromwhenISO, towhenISO } = validateAndParseQuery(req.query);

    // Tjek om DMI API nøgle er tilgængelig
    const apiKey = process.env.DMI_FORECASTEDR_API_KEY;
    if (!apiKey) {
      console.error('DMI_FORECASTEDR_API_KEY miljøvariabel mangler');
      return res.status(500).json({
        error: 'Server konfiguration fejl',
        message: 'DMI API nøgle ikke konfigureret'
      });
    }

    // Tjek cache først
    const cacheParams = { lat, lon, fromwhenISO, towhenISO };
    const cachedData = dmiCache.get(cacheParams);
    
    if (cachedData) {
      console.log('Returnerer cached data');
      return res.status(200).json(cachedData);
    }

    // Hent data fra DMI API
    console.log(`Henter DMI forecast for lat=${lat}, lon=${lon}, from=${fromwhenISO}, to=${towhenISO}`);
    const dmiData = await getDmiInterval(lat, lon, fromwhenISO, towhenISO, apiKey);

    // Gem i cache
    dmiCache.set(cacheParams, dmiData);

    // Returner data
    console.log('Returnerer DMI forecast data');
    res.status(200).json(dmiData);

  } catch (error) {
    console.error('Fejl i DMI forecast endpoint:', error);

    // Håndter forskellige fejltyper
    if (error instanceof Error) {
      // Valideringsfejl - returner 400
      if (error.message.includes('Manglende') || 
          error.message.includes('Ugyldig') ||
          error.message.includes('skal være')) {
        return res.status(400).json({
          error: 'Ugyldig forespørgsel',
          message: error.message
        });
      }

      // DMI API fejl - returner 502
      if (error.message.includes('DMI API fejl') ||
          error.message.includes('Manglende vinddata')) {
        return res.status(502).json({
          error: 'DMI API fejl',
          message: error.message
        });
      }
    }

    // Generel server fejl - returner 500
    res.status(500).json({
      error: 'Intern server fejl',
      message: 'Der opstod en uventet fejl'
    });
  }
});

/**
 * GET /api/dmi/health - Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  const cacheStats = dmiCache.getStats();
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: cacheStats,
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * GET /api/dmi/cache/stats - Cache statistikker
 */
router.get('/cache/stats', (req: Request, res: Response) => {
  const stats = dmiCache.getStats();
  res.status(200).json(stats);
});

/**
 * DELETE /api/dmi/cache - Ryd cache
 */
router.delete('/cache', (req: Request, res: Response) => {
  dmiCache.clear();
  res.status(200).json({
    message: 'Cache ryddet',
    timestamp: new Date().toISOString()
  });
});

// Eksporter router
export default router;
