// ORC Service Polar Calculations
// Håndterer parsing af ORC JSON data og beregning af optimale vinkler og hastigheder

import { Polar, ReachingAngleKey, ReachingMap, ReachingEntry } from './types';

// Standard vindtrin fra ORC
const STANDARD_WIND_SPEEDS = [6, 8, 10, 12, 14, 16, 20];

// Reaching vinkler vi understøtter
const REACH_ANGLES: ReachingAngleKey[] = ["52", "60", "75", "90", "110", "120", "135", "150"];

/**
 * Konverter sekunder per nautisk mil til knob
 * @param secPerNm - Array af sekunder per nautisk mil
 * @returns Array af hastigheder i knob
 */
function toKnots(secPerNm: number[]): number[] {
  return secPerNm.map(s => {
    if (s <= 0) return 0;
    return Number((3600 / s).toFixed(2));
  });
}

/**
 * Lineær interpolation mellem to værdier
 * @param a - Start værdi
 * @param b - Slut værdi
 * @param t - Interpolation faktor (0-1)
 * @returns Interpoleret værdi
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Konverter grader til radianer
 * @param deg - Vinkel i grader
 * @returns Vinkel i radianer
 */
function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

/**
 * Find værdi i nested objekt ved hjælp af regex
 * @param obj - Objekt at søge i
 * @param regex - Regex pattern at matche mod
 * @returns Første match eller undefined
 */
function findInObject(obj: any, regex: RegExp): any {
  if (!obj) return undefined;
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findInObject(item, regex);
      if (result) return result;
    }
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (regex.test(key)) return value;
      const result = findInObject(value, regex);
      if (result) return result;
    }
  }
  
  return undefined;
}

/**
 * Konverter VMG data til knob
 * @param data - VMG data (kan være sec/NM eller allerede i knob)
 * @returns Array af hastigheder i knob
 */
function normalizeVmgToKnots(data: any): number[] | undefined {
  if (!data) return undefined;
  
  const values = data.values || data.data || data;
  if (!Array.isArray(values) || values.length === 0) return undefined;
  
  // Detekter enheder: hvis tal ~500-900 er det sec/NM, hvis 3-10 er det knob
  const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  
  if (avg > 100) {
    // Det er sec/NM, konverter til knob
    return toKnots(values);
  } else {
    // Det er allerede i knob
    return values.map(v => Number(v.toFixed(2)));
  }
}

/**
 * Parse ORC JSON data til Polar format
 * @param orcJson - Raw JSON fra ORC API
 * @returns Polar objekt med parsed data
 */
export function parsePolarFromOrcJson(orcJson: any): Polar {
  console.log('Parser ORC JSON data...');
  
  // ORC data er i rms array, tag første element
  const rmsData = orcJson.rms?.[0];
  if (!rmsData) {
    throw new Error('Ingen RMS data fundet i ORC response');
  }
  
  const allowances = rmsData.Allowances;
  if (!allowances) {
    throw new Error('Ingen Allowances data fundet i ORC response');
  }
  
  // Hent vindhastigheder
  const windSpeeds = allowances.WindSpeeds || STANDARD_WIND_SPEEDS;
  
  // Hent beat data (upwind)
  const beatAngles = allowances.BeatAngle;
  const beatTimes = allowances.Beat; // sekunder per nautisk mil
  const beatVmgKnots = beatTimes ? toKnots(beatTimes) : undefined;
  
  // Hent gybe data (downwind)
  const gybeAngles = allowances.GybeAngle;
  const runTimes = allowances.Run; // sekunder per nautisk mil
  const runVmgKnots = runTimes ? toKnots(runTimes) : undefined;
  
  // Hent reaching data fra R52, R60, R75, R90, R110, R120, R135, R150
  const angleSpeeds: Record<string, number[]> = {};
  const reachingAngles = ['R52', 'R60', 'R75', 'R90', 'R110', 'R120', 'R135', 'R150'];
  
  for (const angleKey of reachingAngles) {
    const times = allowances[angleKey];
    if (Array.isArray(times) && times.length > 0) {
      const angle = angleKey.substring(1); // Fjern 'R' prefix
      angleSpeeds[angle] = toKnots(times);
    }
  }
  
  console.log(`Parsed polar data: windSpeeds=${windSpeeds.length}, beatAngles=${!!beatAngles}, beatVmg=${!!beatVmgKnots}, gybeAngles=${!!gybeAngles}, runVmg=${!!runVmgKnots}, angleSpeeds=${Object.keys(angleSpeeds).length} angles`);
  
  return {
    wind: windSpeeds,
    beatAngles: beatAngles,
    beatVmg: beatVmgKnots,
    gybeAngles: gybeAngles,
    runVmg: runVmgKnots,
    angleSpeeds
  };
}

/**
 * Interpoler værdi ved given TWS
 * @param values - Array af værdier
 * @param windSpeeds - Array af vindhastigheder
 * @param tws - Ønsket vindhastighed
 * @returns Interpoleret værdi eller undefined
 */
function interpAtTws(values: number[], windSpeeds: number[], tws: number): number | undefined {
  if (!values || values.length !== windSpeeds.length) return undefined;
  
  // Hvis TWS er under minimum, brug minimum værdi
  if (tws <= windSpeeds[0]) return values[0];
  
  // Hvis TWS er over maximum, brug maximum værdi
  if (tws >= windSpeeds[windSpeeds.length - 1]) return values[windSpeeds.length - 1];
  
  // Find interval og interpoler
  for (let i = 0; i < windSpeeds.length - 1; i++) {
    if (tws >= windSpeeds[i] && tws <= windSpeeds[i + 1]) {
      const t = (tws - windSpeeds[i]) / (windSpeeds[i + 1] - windSpeeds[i]);
      return lerp(values[i], values[i + 1], t);
    }
  }
  
  return undefined;
}

/**
 * Beregn VMG for upwind
 * @param twa - True Wind Angle i grader
 * @param bs - Boat Speed i knob
 * @returns VMG i knob
 */
function calculateUpwindVMG(twa: number, bs: number): number {
  return bs * Math.cos(toRad(twa));
}

/**
 * Beregn VMG for downwind
 * @param twa - True Wind Angle i grader
 * @param bs - Boat Speed i knob
 * @returns VMG i knob
 */
function calculateDownwindVMG(twa: number, bs: number): number {
  return bs * Math.cos(toRad(180 - twa));
}

/**
 * Beregn reaching data for alle standard vinkler
 * @param polar - Polar data
 * @param tws - True Wind Speed
 * @returns Reaching map med target boatspeed og VMG
 */
function computeReaching(polar: Polar, tws: number): ReachingMap {
  const reaching: ReachingMap = {};
  
  for (const angleStr of REACH_ANGLES) {
    const speedList = polar.angleSpeeds?.[angleStr];
    if (!speedList || speedList.length !== polar.wind.length) continue;
    
    const bs = interpAtTws(speedList, polar.wind, tws);
    if (typeof bs !== 'number' || !Number.isFinite(bs) || bs <= 0) continue;
    
    const angle = Number(angleStr);
    const vmg = calculateUpwindVMG(angle, bs); // VMG beregnes altid som upwind VMG
    
    reaching[angleStr] = {
      twa_deg: angle,
      target_bs_kt: Number(bs.toFixed(2)),
      vmg_kt: Number(vmg.toFixed(2))
    };
  }
  
  return reaching;
}

/**
 * Find optimal upwind vinkel og VMG fra vinkelrækker
 * @param polar - Polar data
 * @param tws - True Wind Speed
 * @returns Optimal upwind data
 */
function findOptimalUpwindFromAngles(polar: Polar, tws: number): { twa: number; vmg: number; bs: number } | null {
  const angleSet = Object.keys(polar.angleSpeeds || {})
    .map(Number)
    .filter(a => a >= 35 && a <= 75) // Rimeligt upwind interval
    .sort((a, b) => a - b);
  
  if (angleSet.length === 0) return null;
  
  let best = { twa: 45, vmg: -1, bs: 0 };
  
  for (let i = 0; i < angleSet.length; i++) {
    const angle = angleSet[i];
    const speedList = polar.angleSpeeds![String(angle)];
    const bs = interpAtTws(speedList, polar.wind, tws);
    
    if (typeof bs !== 'number' || !Number.isFinite(bs) || bs <= 0) continue;
    
    const vmg = calculateUpwindVMG(angle, bs);
    if (vmg > best.vmg) {
      best = { twa: angle, vmg, bs };
    }
    
    // Grov interpolation mellem nabovinkler
    if (i < angleSet.length - 1) {
      const nextAngle = angleSet[i + 1];
      const nextSpeedList = polar.angleSpeeds![String(nextAngle)];
      const nextBs = interpAtTws(nextSpeedList, polar.wind, tws);
      
      if (typeof nextBs === 'number' && Number.isFinite(nextBs) && nextBs > 0) {
        for (const t of [0.25, 0.5, 0.75]) {
          const interpAngle = lerp(angle, nextAngle, t);
          const interpBs = lerp(bs, nextBs, t);
          const interpVmg = calculateUpwindVMG(interpAngle, interpBs);
          
          if (interpVmg > best.vmg) {
            best = { twa: interpAngle, vmg: interpVmg, bs: interpBs };
          }
        }
      }
    }
  }
  
  return best.vmg > 0 ? best : null;
}

/**
 * Find optimal downwind vinkel og VMG fra vinkelrækker
 * @param polar - Polar data
 * @param tws - True Wind Speed
 * @returns Optimal downwind data
 */
function findOptimalDownwindFromAngles(polar: Polar, tws: number): { twa: number; vmg: number; bs: number } | null {
  const angleSet = Object.keys(polar.angleSpeeds || {})
    .map(Number)
    .filter(a => a >= 135 && a <= 179) // Rimeligt downwind interval
    .sort((a, b) => a - b);
  
  if (angleSet.length === 0) return null;
  
  let best = { twa: 160, vmg: -1, bs: 0 };
  
  for (let i = 0; i < angleSet.length; i++) {
    const angle = angleSet[i];
    const speedList = polar.angleSpeeds![String(angle)];
    const bs = interpAtTws(speedList, polar.wind, tws);
    
    if (typeof bs !== 'number' || !Number.isFinite(bs) || bs <= 0) continue;
    
    const vmg = calculateDownwindVMG(angle, bs);
    if (vmg > best.vmg) {
      best = { twa: angle, vmg, bs };
    }
    
    // Grov interpolation mellem nabovinkler
    if (i < angleSet.length - 1) {
      const nextAngle = angleSet[i + 1];
      const nextSpeedList = polar.angleSpeeds![String(nextAngle)];
      const nextBs = interpAtTws(nextSpeedList, polar.wind, tws);
      
      if (typeof nextBs === 'number' && Number.isFinite(nextBs) && nextBs > 0) {
        for (const t of [0.25, 0.5, 0.75]) {
          const interpAngle = lerp(angle, nextAngle, t);
          const interpBs = lerp(bs, nextBs, t);
          const interpVmg = calculateDownwindVMG(interpAngle, interpBs);
          
          if (interpVmg > best.vmg) {
            best = { twa: interpAngle, vmg: interpVmg, bs: interpBs };
          }
        }
      }
    }
  }
  
  return best.vmg > 0 ? best : null;
}

/**
 * Beregn optimale vinkler og hastigheder
 * @param polar - Polar data
 * @param tws - True Wind Speed
 * @returns Optimal data for upwind, downwind og reaching
 */
export function computeOptimal(
  polar: Polar, 
  tws: number
): {
  up: { twa: number; vmg: number; bs: number };
  dn: { twa: number; vmg: number; bs: number };
  reaching: ReachingMap;
  notes: string[];
} {
  const notes: string[] = [];
  
  // 1) Prøv direkte Beat/Gybe vinkler + VMG
  let beatAngle = polar.beatAngles ? interpAtTws(polar.beatAngles, polar.wind, tws) : undefined;
  let beatVmg = polar.beatVmg ? interpAtTws(polar.beatVmg, polar.wind, tws) : undefined;
  let gybeAngle = polar.gybeAngles ? interpAtTws(polar.gybeAngles, polar.wind, tws) : undefined;
  let runVmg = polar.runVmg ? interpAtTws(polar.runVmg, polar.wind, tws) : undefined;
  
  // 2) Fallback: estimer vinkler fra vinkelrækker
  if (beatAngle == null || beatVmg == null) {
    const upwindFromAngles = findOptimalUpwindFromAngles(polar, tws);
    if (upwindFromAngles) {
      beatAngle = upwindFromAngles.twa;
      beatVmg = upwindFromAngles.vmg;
      notes.push('Beat vinkel/VMG estimeret fra vinkelrækker');
    }
  }
  
  if (gybeAngle == null || runVmg == null) {
    const downwindFromAngles = findOptimalDownwindFromAngles(polar, tws);
    if (downwindFromAngles) {
      gybeAngle = downwindFromAngles.twa;
      runVmg = downwindFromAngles.vmg;
      notes.push('Gybe vinkel/VMG estimeret fra vinkelrækker');
    }
  }
  
  // Valider at vi har tilstrækkelige data
  if (beatAngle == null || beatVmg == null || gybeAngle == null || runVmg == null) {
    throw new Error('Mangler tilstrækkelige data til at beregne optimale vinkler/VMG');
  }
  
  // Beregn target boatspeed
  const upBs = beatVmg / Math.cos(toRad(beatAngle));
  const dnBs = runVmg / Math.cos(toRad(180 - gybeAngle));
  
  // Beregn reaching data
  const reaching = computeReaching(polar, tws);
  
  return {
    up: { 
      twa: Number(beatAngle.toFixed(1)), 
      vmg: Number(beatVmg.toFixed(2)), 
      bs: Number(upBs.toFixed(2)) 
    },
    dn: { 
      twa: Number(gybeAngle.toFixed(1)), 
      vmg: Number(runVmg.toFixed(2)), 
      bs: Number(dnBs.toFixed(2)) 
    },
    reaching,
    notes
  };
}
