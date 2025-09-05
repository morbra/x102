import fetch from 'node-fetch';

// DMI Forecast EDR API base URL
const DMI_BASE_URL = 'https://dmigw.govcloud.dk/v1/forecastedr';

// Interface for DMI API parametre
interface DmiApiParams {
  coords: string;
  crs: string;
  datetime: string;
  'parameter-name': string;
  'api-key': string;
}

// Interface for CoverageJSON response fra DMI
interface CoverageJSON {
  ranges?: {
    [key: string]: {
      values?: number[];
    };
  };
}

// Interface for GeoJSON response fra DMI bbox
interface GeoJSONResponse {
  features?: Array<{
    properties?: {
      [key: string]: number;
    };
    geometry?: {
      coordinates: [number, number]; // [lon, lat]
    };
  }>;
}

// Interface for vinddata
interface WindData {
  mean_ms: number;
  gust_ms: number;
  dir_deg: number;
}

// Interface for bølgedata
interface WaveData {
  hs_m: number;
  tp_s: number;
  dir_deg: number;
}

// Interface for komplet svar
interface DmiPointResponse {
  coord: { lat: number; lon: number };
  time: string;
  wind: WindData;
  waves: WaveData | null;
}

// Interface for tidsinterval data
interface DmiIntervalData {
  time: string;
  wind: WindData;
  waves: WaveData | null;
}

// Interface for interval svar
interface DmiIntervalResponse {
  coord: { lat: number; lon: number };
  from: string;
  to: string;
  interval: string; // "1h" for 1-timers intervaller
  data: DmiIntervalData[];
  source: {
    harmonie_collection: string;
    wam_collection: string;
  };
  meta: {
    provider: string;
    crs: string;
  };
}

/**
 * Henter WAM data fra nærmeste havcelle via bbox fallback
 * @param lat - Breddegrad
 * @param lon - Længdegrad
 * @param whenISO - ISO tidspunkt (UTC)
 * @param apiKey - DMI API nøgle
 * @param collection - WAM collection navn
 * @returns Promise med WaveData eller null
 */
async function fetchWamNearestSea(
  lat: number, 
  lon: number, 
  whenISO: string, 
  apiKey: string, 
  collection = 'wam_dw'
): Promise<WaveData | null> {
  const eps = 0.03; // ~3 km
  const bbox = `${(lon-eps).toFixed(4)},${(lat-eps).toFixed(4)},${(lon+eps).toFixed(4)},${(lat+eps).toFixed(4)}`;
  
  // Konverter tidspunkt til interval (3 timer fremad)
  const whenDate = new Date(whenISO);
  const endTime = new Date(whenDate.getTime() + 3 * 60 * 60 * 1000);
  const datetimeInterval = `${whenISO}/${endTime.toISOString()}`;
  
  const url = `${DMI_BASE_URL}/collections/${collection}/bbox?bbox=${bbox}&crs=crs84&parameter-name=significant-wave-height,mean-wave-period,mean-wave-dir&datetime=${encodeURIComponent(datetimeInterval)}&api-key=${encodeURIComponent(apiKey)}&f=GeoJSON`;

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`WAM bbox ${r.status}`);
    const gj = await r.json() as GeoJSONResponse;

    let best: WaveData | null = null, bestD2 = Infinity;
    for (const f of gj?.features ?? []) {
      const p = f.properties || {};
      const hasHs = p['significant-wave-height'] != null;
      const hasTp = p['mean-wave-period'] != null;
      const hasDir = p['mean-wave-dir'] != null;
      if ((hasHs || hasTp || hasDir) && f.geometry?.coordinates) {
        const [fx, fy] = f.geometry.coordinates; // lon, lat
        const d2 = (fx - lon) ** 2 + (fy - lat) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = {
            hs_m: hasHs ? p['significant-wave-height'] : 0,
            tp_s: hasTp ? p['mean-wave-period'] : 0,
            dir_deg: hasDir ? p['mean-wave-dir'] : 0
          };
        }
      }
    }
    return best; // kan være null
  } catch (error) {
    console.warn(`WAM bbox fallback fejlede for ${collection}:`, error);
    return null;
  }
}

/**
 * Henter data fra DMI Forecast EDR API
 * @param collection - DMI collection navn (f.eks. 'harmonie_dini_sf' eller 'wam_dw')
 * @param params - API parametre (inkluderer api-key)
 * @returns Promise med CoverageJSON data
 */
async function fetchDmiData(
  collection: string,
  params: DmiApiParams
): Promise<CoverageJSON> {
  const url = `${DMI_BASE_URL}/collections/${collection}/position`;
  
  // Byg query string fra parametre
  // Brug custom encoding for at matche DMI API format
  const queryParts: string[] = [];
  Object.entries(params).forEach(([key, value]) => {
    // URL encode key, men ikke value for datetime (da det skal være uencodet)
    if (key === 'datetime') {
      queryParts.push(`${encodeURIComponent(key)}=${value}`);
    } else {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  });
  
  const fullUrl = `${url}?${queryParts.join('&')}`;
  console.log('Fetching DMI data from:', fullUrl);
  console.log('Query params:', params);
  try {
    // Opret AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sekunder timeout

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    // Ryd timeout timer
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`DMI API fejl: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as CoverageJSON;
    return data;
  } catch (error) {
    console.error(`Fejl ved hentning af DMI data fra ${collection}:`, error);
    throw error;
  }
}

/**
 * Henter første værdi fra CoverageJSON range
 * @param coverage - CoverageJSON objekt
 * @param paramName - Navn på parameter
 * @returns Første værdi eller undefined
 */
function pickValue(coverage: CoverageJSON | null, paramName: string): number | undefined {
  if (!coverage?.ranges?.[paramName]?.values) {
    return undefined;
  }
  return coverage.ranges[paramName].values![0];
}

/**
 * Henter vind og bølgedata for et specifikt punkt og tidspunkt
 * @param lat - Breddegrad
 * @param lon - Længdegrad  
 * @param whenISO - ISO tidspunkt (UTC)
 * @param apiKey - DMI API nøgle
 * @returns Promise med komplet DMI data
 */
export async function getDmiPoint(
  lat: number,
  lon: number,
  whenISO: string,
  apiKey: string
): Promise<DmiPointResponse> {
  // Valider input parametre
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('lat og lon skal være tal');
  }
  
  if (lat < -90 || lat > 90) {
    throw new Error('lat skal være mellem -90 og 90');
  }
  
  if (lon < -180 || lon > 180) {
    throw new Error('lon skal være mellem -180 og 180');
  }

  // Byg koordinat string for DMI API
  const coords = `POINT(${lon} ${lat})`;
  
  // Konverter enkelt tidspunkt til interval (3 timers interval)
  const whenDate = new Date(whenISO);
  const startTime = whenDate.toISOString();
  const endTime = new Date(whenDate.getTime() + 3 * 60 * 60 * 1000).toISOString(); // +3 timer
  const datetimeInterval = `${startTime}/${endTime}`;
  
  // HARMONIE parametre for vinddata (i samme rækkefølge som dit eksempel)
  const harmParams: DmiApiParams = {
    coords,
    'parameter-name': 'wind-speed-10m,wind-dir-10m,gust-wind-speed-10m',
    datetime: datetimeInterval,
    'api-key': apiKey,
    crs: 'crs84'
  };

  // WAM parametre for bølgedata
  const wamParams: DmiApiParams = {
    coords,
    'parameter-name': 'significant-wave-height,mean-wave-period,mean-wave-dir',
    datetime: datetimeInterval,
    'api-key': apiKey,
    crs: 'crs84'
  };

  try {
    // Hent vinddata fra HARMONIE
    console.log(`Henter vinddata for ${coords} på ${whenISO}`);
    const windCoverage = await fetchDmiData('harmonie_dini_sf', harmParams);
    
    // Hent bølgedata fra WAM (kan fejle for landområder)
    let waveCoverage: CoverageJSON | null = null;
    try {
      console.log(`Henter bølgedata for ${coords} på ${whenISO}`);
      waveCoverage = await fetchDmiData('wam_dw', wamParams);
    } catch (waveError) {
      console.warn(`Kunne ikke hente bølgedata: ${waveError}`);
      // Bølgedata er valgfrit, så vi fortsætter uden
    }

    // Parse vinddata
    const mean_ms = pickValue(windCoverage, 'wind-speed-10m');
    let gust_ms = pickValue(windCoverage, 'gust-wind-speed-10m');
    
    // Fallback til alternativ gust parameter hvis den primære mangler
    if (gust_ms === undefined) {
      gust_ms = pickValue(windCoverage, 'gust-wind-speed');
    }
    
    const dir_deg = pickValue(windCoverage, 'wind-dir-10m');

    // Valider at vi har de nødvendige vinddata
    if (mean_ms === undefined || dir_deg === undefined) {
      throw new Error('Manglende vinddata fra DMI API');
    }

    // Parse bølgedata (hvis tilgængelig)
    let waves: WaveData | null = null;
    if (waveCoverage) {
      const hs_m = pickValue(waveCoverage, 'significant-wave-height');
      const tp_s = pickValue(waveCoverage, 'mean-wave-period');
      const wdir = pickValue(waveCoverage, 'mean-wave-dir');

      // Inkluder bølgedata hvis vi har alle felter med gyldige værdier
      if (hs_m !== undefined && hs_m !== null && tp_s !== undefined && tp_s !== null && 
          wdir !== undefined && wdir !== null && !isNaN(hs_m) && !isNaN(tp_s) && !isNaN(wdir)) {
        waves = {
          hs_m,
          tp_s,
          dir_deg: wdir
        };
      }
    }

    // Fallback: punkt lå måske på land → find nærmeste havcelle via bbox
    if (!waves) {
      console.log('Prøver WAM bbox fallback for nærmeste havcelle...');
      const fallbackWaves = await fetchWamNearestSea(lat, lon, whenISO, apiKey, 'wam_dw')
          || await fetchWamNearestSea(lat, lon, whenISO, apiKey, 'wam_nsb')  // alternativt domæne
          || await fetchWamNearestSea(lat, lon, whenISO, apiKey, 'wam_natlant');
      
      // Kun accepter fallback hvis vi har gyldige værdier (ikke 0)
      if (fallbackWaves && 
          fallbackWaves.hs_m > 0 && fallbackWaves.tp_s > 0 && fallbackWaves.dir_deg >= 0) {
        waves = fallbackWaves;
      }
    }

    // Byg svar objekt
    const response: DmiPointResponse = {
      coord: { lat, lon },
      time: whenISO,
      wind: {
        mean_ms,
        gust_ms: gust_ms || 0, // Default til 0 hvis gust data mangler
        dir_deg
      },
      waves: waves || null // Kun inkluder waves hvis vi har gyldige data
    };

    return response;
  } catch (error) {
    console.error('Fejl ved hentning af DMI point data:', error);
    throw error;
  }
}

/**
 * Henter vind og bølgedata for et specifikt punkt og tidsinterval
 * @param lat - Breddegrad
 * @param lon - Længdegrad  
 * @param fromISO - Start tidspunkt (UTC)
 * @param toISO - Slut tidspunkt (UTC)
 * @param apiKey - DMI API nøgle
 * @returns Promise med komplet DMI interval data
 */
export async function getDmiInterval(
  lat: number,
  lon: number,
  fromISO: string,
  toISO: string,
  apiKey: string
): Promise<DmiIntervalResponse> {
  // Valider input parametre
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('lat og lon skal være tal');
  }
  
  if (lat < -90 || lat > 90) {
    throw new Error('lat skal være mellem -90 og 90');
  }
  
  if (lon < -180 || lon > 180) {
    throw new Error('lon skal være mellem -180 og 180');
  }

  // Valider tidsinterval
  const fromDate = new Date(fromISO);
  const toDate = new Date(toISO);
  
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new Error('Ugyldig tidsinterval: fromISO og toISO skal være gyldige ISO datoer');
  }
  
  if (fromDate >= toDate) {
    throw new Error('fromISO skal være før toISO');
  }

  // Byg koordinat string for DMI API
  const coords = `POINT(${lon} ${lat})`;
  
  // Byg datetime interval string
  const datetimeInterval = `${fromISO}/${toISO}`;
  
  // HARMONIE parametre for vinddata
  const harmParams: DmiApiParams = {
    coords,
    'parameter-name': 'wind-speed-10m,wind-dir-10m,gust-wind-speed-10m',
    datetime: datetimeInterval,
    'api-key': apiKey,
    crs: 'crs84'
  };

  // WAM parametre for bølgedata
  const wamParams: DmiApiParams = {
    coords,
    'parameter-name': 'significant-wave-height,mean-wave-period,mean-wave-dir',
    datetime: datetimeInterval,
    'api-key': apiKey,
    crs: 'crs84'
  };

  try {
    // Hent vinddata fra HARMONIE
    console.log(`Henter vinddata for ${coords} fra ${fromISO} til ${toISO}`);
    const windCoverage = await fetchDmiData('harmonie_dini_sf', harmParams);
    
    // Hent bølgedata fra WAM (kan fejle for landområder)
    let waveCoverage: CoverageJSON | null = null;
    try {
      console.log(`Henter bølgedata for ${coords} fra ${fromISO} til ${toISO}`);
      waveCoverage = await fetchDmiData('wam_dw', wamParams);
    } catch (waveError) {
      console.warn(`Kunne ikke hente bølgedata: ${waveError}`);
      // Bølgedata er valgfrit, så vi fortsætter uden
    }

    // Parse vinddata for hvert tidsinterval
    const windValues = windCoverage.ranges || {};
    const windSpeedValues = windValues['wind-speed-10m']?.values || [];
    const windDirValues = windValues['wind-dir-10m']?.values || [];
    const windGustValues = windValues['gust-wind-speed-10m']?.values || windValues['gust-wind-speed']?.values || [];

    // Parse bølgedata for hvert tidsinterval
    const waveValues = waveCoverage?.ranges || {};
    const waveHeightValues = waveValues['significant-wave-height']?.values || [];
    const wavePeriodValues = waveValues['mean-wave-period']?.values || [];
    const waveDirValues = waveValues['mean-wave-dir']?.values || [];

    // Valider at vi har de nødvendige vinddata
    if (windSpeedValues.length === 0 || windDirValues.length === 0) {
      throw new Error('Manglende vinddata fra DMI API');
    }

    // Beregn antal tidsintervaller (DMI returnerer data hver time)
    const numIntervals = Math.max(windSpeedValues.length, windDirValues.length);
    const intervalData: DmiIntervalData[] = [];

    // Generer 1-timers intervaller direkte fra DMI data
    for (let i = 0; i < numIntervals; i++) {
      const timeOffset = i * 60 * 60 * 1000; // 1 time i millisekunder
      const currentTime = new Date(fromDate.getTime() + timeOffset);
      
      // Parse vinddata for dette tidsinterval (direkte fra DMI time-interval)
      const mean_ms = windSpeedValues[i];
      const dir_deg = windDirValues[i];
      const gust_ms = windGustValues[i] || 0;

      if (mean_ms === undefined || dir_deg === undefined) {
        continue; // Spring over manglende data
      }

      // Parse bølgedata for dette tidsinterval (direkte fra DMI time-interval)
      let waves: WaveData | null = null;
      if (waveHeightValues[i] !== undefined && wavePeriodValues[i] !== undefined && waveDirValues[i] !== undefined) {
        const hs_m = waveHeightValues[i];
        const tp_s = wavePeriodValues[i];
        const wdir = waveDirValues[i];

        // Inkluder bølgedata hvis vi har alle felter med gyldige værdier
        if (hs_m !== null && tp_s !== null && wdir !== null && 
            !isNaN(hs_m) && !isNaN(tp_s) && !isNaN(wdir) && hs_m > 0) {
          waves = {
            hs_m,
            tp_s,
            dir_deg: wdir
          };
        }
      }

      // Fallback: punkt lå måske på land → find nærmeste havcelle via bbox
      if (!waves) {
        console.log(`Prøver WAM bbox fallback for tidsinterval ${i}...`);
        const fallbackWaves = await fetchWamNearestSea(lat, lon, currentTime.toISOString(), apiKey, 'wam_dw')
            || await fetchWamNearestSea(lat, lon, currentTime.toISOString(), apiKey, 'wam_nsb')
            || await fetchWamNearestSea(lat, lon, currentTime.toISOString(), apiKey, 'wam_natlant');
        
        // Kun accepter fallback hvis vi har gyldige værdier (ikke 0)
        if (fallbackWaves && 
            fallbackWaves.hs_m > 0 && fallbackWaves.tp_s > 0 && fallbackWaves.dir_deg >= 0) {
          waves = fallbackWaves;
        }
      }

      intervalData.push({
        time: currentTime.toISOString(),
        wind: {
          mean_ms,
          gust_ms,
          dir_deg
        },
        waves: waves || null
      });
    }

    // Byg svar objekt
    const response: DmiIntervalResponse = {
      coord: { lat, lon },
      from: fromISO,
      to: toISO,
      interval: "1h", // DMI data kommer hver time
      data: intervalData,
      source: {
        harmonie_collection: 'harmonie_dini_sf',
        wam_collection: 'wam_dw'
      },
      meta: {
        provider: 'DMI',
        crs: 'crs84'
      }
    };

    return response;
  } catch (error) {
    console.error('Fejl ved hentning af DMI interval data:', error);
    throw error;
  }
}
