// ORC Service Types
// Definerer interfaces for ORC optimal beregninger

export type OptimalRequest = {
  tws: number;               // sand vindhastighed i knob
  refNo?: string;            // ORC reference nummer (foretrækkes)
  sailNo?: string;           // Sail number
  yachtName?: string;        // Bådnavn
  countryId?: string;        // Landekode (fx GRE, DEN)
};

// Reaching-vinklerne vi understøtter i ORC
export type ReachingAngleKey = "52"|"60"|"75"|"90"|"110"|"120"|"135"|"150";

export type ReachingEntry = {
  twa_deg: number;         // selve vinklen, fx 90
  target_bs_kt: number;    // target boatspeed i knob
  vmg_kt: number;          // VMG ved den vinkel (bs * cos)
};

export type ReachingMap = Partial<Record<ReachingAngleKey, ReachingEntry>>;

export type OptimalResponse = {
  boatId: { 
    refNo?: string; 
    sailNo?: string; 
    yachtName?: string; 
    countryId?: string; 
  };
  tws: number;                      // ønsket TWS (evtl. interpoleret)
  upwind:  { 
    twa_deg: number; 
    vmg_kt: number; 
    target_bs_kt: number; 
  };
  downwind: { 
    twa_deg: number; 
    vmg_kt: number; 
    target_bs_kt: number; 
  };
  reaching: ReachingMap;            // target bådfarter (knob) ved 52..150°
  source:  { 
    cached: boolean; 
    fetchedAt: string; 
    endpoint: string; 
    notes?: string; 
  };
};

// Interne typer for polar data
export type Polar = {
  wind: number[]; // e.g. [6,8,10,12,14,16,20]
  beatAngles?: number[];
  beatVmg?: number[];          // in knots
  gybeAngles?: number[];
  runVmg?: number[];           // in knots
  angleSpeeds?: Record<string, number[]>; // "52","60",... -> knots list per TWS
};

// Cache entry type
export type CacheEntry = {
  json: any;
  polar: Polar;
  fetchedAt: string;
};
