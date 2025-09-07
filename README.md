# DMI & ORC Microservice

En server-side microservice der henter forecast data fra DMI's Forecast EDR API og beregner optimale sejlvinkler via ORC:
- **DMI Vinddata**: Middelvind, vindstød, vindretning (HARMONIE model)
- **DMI Bølgedata**: Signifikant bølgehøjde, middelperiode og retning (WAM model)
- **ORC Optimal**: Beregner optimale upwind/downwind vinkler og reaching hastigheder

## Funktioner

### Forecast Service (DMI EDR)
- Henter vinddata fra DMI HARMONIE model (time-intervaller)
- Henter bølgedata fra DMI WAM model (time-intervaller)
- **Bbox fallback**: Finder nærmeste havcelle hvis punkt er på land
- In-memory cache med 5 minutters TTL
- Intelligent fallback til multiple WAM domæner
- Returnerer data for hver time i det angivne tidsinterval

### Optimal Service (ORC)
- Beregner optimale upwind og downwind sejlvinkler
- Returnerer target boatspeed og VMG for hver vinkel
- **Reaching data**: Target boatspeed ved 52°, 60°, 75°, 90°, 110°, 120°, 135°, 150°
- **Intelligent fallback**: Bruger vinkelrækker hvis direkte data mangler
- **Lineær interpolation**: Mellem ORC's vindtrin (6,8,10,12,14,16,20 kn)
- LRU cache med 24 timers TTL for ORC data

### Generelt
- RESTful API med JSON svar
- Fejlhåndtering og validering
- Health check og cache statistikker
- Modulær struktur klar til flere services

## Installation

1. Installer dependencies:
```bash
npm install
```
2. Opret en `.env` fil baseret på `env.example`:
   ```bash
   cp env.example .env
   ```
3. Tilføj din DMI API-nøgle til `.env` filen, fx:
   ```
   DMI_FORECASTEDR_API_KEY=din_api_nøgle_her
   ```
### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## API Endpoints

### DMI Forecast Endpoints

#### GET /api/dmi/forecast
Henter vind og bølgedata for et specifikt punkt.

**Parametre:**
- `lat` (påkrævet): Breddegrad (-90 til 90)
- `lon` (påkrævet): Længdegrad (-180 til 180)
- `fromwhen` (valgfrit): Start tidspunkt (UTC), kræver `towhen`
- `towhen` (valgfrit): Slut tidspunkt (UTC), kræver `fromwhen`
- Default: nu til nu + 3 timer hvis ingen tidsinterval angives

**Eksempler:**
```bash
# Default: nu til nu + 3 timer
curl "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561"

# Custom tidsinterval
curl "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561&fromwhen=2025-01-03T12:00:00Z&towhen=2025-01-04T12:00:00Z"
```

**Svar (200):**
```json
{
  "coord": { "lat": 55.715, "lon": 12.561 },
  "from": "2025-01-03T12:00:00Z",
  "to": "2025-01-03T15:00:00Z",
  "interval": "1h",
  "data": [
    {
      "time": "2025-01-03T12:00:00Z",
      "wind": { "mean_ms": 7.4, "gust_ms": 10.1, "dir_deg": 230 },
      "waves": { "hs_m": 0.6, "tp_s": 4.5, "dir_deg": 220 }
    },
    {
      "time": "2025-01-03T13:00:00Z",
      "wind": { "mean_ms": 7.4, "gust_ms": 10.1, "dir_deg": 230 },
      "waves": { "hs_m": 0.6, "tp_s": 4.5, "dir_deg": 220 }
    },
    {
      "time": "2025-01-03T14:00:00Z",
      "wind": { "mean_ms": 7.4, "gust_ms": 10.1, "dir_deg": 230 },
      "waves": { "hs_m": 0.6, "tp_s": 4.5, "dir_deg": 220 }
    }
  ],
  "source": { "harmonie_collection": "harmonie_dini_sf", "wam_collection": "wam_dw" },
  "meta": { "provider": "DMI", "crs": "crs84" }
}
```

#### GET /api/dmi/health
DMI forecast health check.

#### GET /api/dmi/cache/stats
Cache statistikker.

#### DELETE /api/dmi/cache
Ryd cache.

### ORC Optimal Endpoints

#### GET /api/orc/optimal
Beregner optimale sejlvinkler og hastigheder for en båd.

**Parametre:**
- `tws` (påkrævet): True Wind Speed i knob (2-50)
- `refNo` (valgfrit): ORC reference nummer (foretrækkes)
- `sailNo` (valgfrit): Sail number
- `yachtName` (valgfrit): Bådnavn (kræver `countryId`)
- `countryId` (valgfrit): Landekode (fx GRE, DEN)

**Eksempler:**
```bash
# Med ORC reference nummer
curl "http://localhost:3000/api/orc/optimal?tws=12&refNo=034200028W9"

# Med sail number
curl "http://localhost:3000/api/orc/optimal?tws=12&sailNo=GRE-49128"

# Med bådnavn og land
curl "http://localhost:3000/api/orc/optimal?tws=12&yachtName=OUSYRA&countryId=GRE"
```

**Svar (200):**
```json
{
  "boatId": {
    "refNo": "034200028W9",
    "sailNo": null,
    "yachtName": null,
    "countryId": null
  },
  "tws": 12,
  "upwind": {
    "twa_deg": 39.1,
    "vmg_kt": 4.79,
    "target_bs_kt": 6.17
  },
  "downwind": {
    "twa_deg": 159.2,
    "vmg_kt": 5.71,
    "target_bs_kt": 6.11
  },
  "reaching": {
    "52": { "twa_deg": 52, "target_bs_kt": 6.75, "vmg_kt": 4.16 },
    "60": { "twa_deg": 60, "target_bs_kt": 6.89, "vmg_kt": 3.45 },
    "75": { "twa_deg": 75, "target_bs_kt": 7.02, "vmg_kt": 1.82 },
    "90": { "twa_deg": 90, "target_bs_kt": 7.15, "vmg_kt": 0.00 },
    "110": { "twa_deg": 110, "target_bs_kt": 7.21, "vmg_kt": 2.47 },
    "120": { "twa_deg": 120, "target_bs_kt": 7.13, "vmg_kt": 3.56 },
    "135": { "twa_deg": 135, "target_bs_kt": 6.87, "vmg_kt": 4.86 },
    "150": { "twa_deg": 150, "target_bs_kt": 6.47, "vmg_kt": 5.60 }
  },
  "source": {
    "cached": false,
    "fetchedAt": "2025-01-03T12:00:00Z",
    "endpoint": "https://data.orc.org/public/WPub.dll?action=DownBoatRMS&RefNo=034200028W9&ext=json",
    "notes": "Beat vinkel/VMG estimeret fra vinkelrækker"
  }
}
```

#### GET /api/orc/health
ORC optimal health check og cache statistikker.

#### GET /api/orc/cache/stats
ORC cache statistikker.

#### POST /api/orc/cache/clear
Ryd ORC cache.

## Fejlhåndtering

- **400**: Ugyldig forespørgsel (manglende/ugyldig parametre)
- **404**: Båd ikke fundet (ORC) / Ingen data (DMI)
- **502**: DMI/ORC API fejl (manglende data fra eksterne API'er)
- **500**: Intern server fejl

## Cache

### DMI Cache
- TTL: 5 minutter
- Automatisk cleanup hver 2. minut
- Hash-baseret nøgler
- Statistikker tilgængelige via API

### ORC Cache
- TTL: 24 timer
- LRU eviction (100 entries)
- Cache key prioritet: refNo > countryId|sailNo > yachtName
- Statistikker tilgængelige via API

## Tidsintervaller

Service returnerer data for hver time i det angivne tidsinterval:
- **DMI data**: Henter direkte time-intervaller fra DMI API
- **1-timers output**: Hver time får sit eget data punkt
- **Default interval**: Nu til nu + 3 timer (3 data punkter)
- **Custom interval**: Bruger `fromwhen` og `towhen` parametre

## Bbox Fallback

For bølgedata bruger service intelligent fallback:
1. **Første forsøg**: Direkte punkt-forespørgsel til WAM
2. **Fallback**: Hvis punkt er på land, søg i 6km bbox omkring punktet
3. **Multiple domæner**: Prøv `wam_dw`, `wam_nsb`, `wam_natlant` i rækkefølge
4. **Nærmeste havcelle**: Vælg celle med kortest afstand til punktet

## Projektstruktur

```
services/
├── index.ts              # Hovedserver (Express app)
├── dmi/                  # DMI Forecast service
│   ├── router.ts         # API routes
│   ├── dmiClient.ts      # DMI API klient
│   └── cache.ts          # In-memory cache
├── orc/                  # ORC Optimal service
│   ├── index.ts          # Hovedfunktioner (optimal)
│   ├── router.ts         # API routes
│   ├── client.ts         # ORC API klient
│   ├── polar.ts          # Polar beregninger
│   ├── cache.ts          # LRU cache
│   └── types.ts          # TypeScript interfaces
└── [fremtidige services] # Modulær struktur
```

## Sikkerhed

- API nøgle kun server-side (ikke eksponeret til browser)
- Input validering på alle parametre
- CORS konfigureret for development
- Timeout på DMI API kald (30 sekunder)

## Test

Test API endpoints:
```bash
# DMI Forecast tests
curl "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561"
curl "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561&fromwhen=2025-01-03T12:00:00Z&towhen=2025-01-04T12:00:00Z"
curl "http://localhost:3000/api/dmi/health"
curl "http://localhost:3000/api/dmi/cache/stats"

# ORC Optimal tests
curl "http://localhost:3000/api/orc/optimal?tws=12&refNo=034200028W9"
curl "http://localhost:3000/api/orc/optimal?tws=12&sailNo=GRE-49128"
curl "http://localhost:3000/api/orc/optimal?tws=12&yachtName=OUSYRA&countryId=GRE"
curl "http://localhost:3000/api/orc/health"
curl "http://localhost:3000/api/orc/cache/stats"

# Kør alle tests
./test-examples.sh
```
