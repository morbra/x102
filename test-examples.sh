#!/bin/bash

# Test eksempler for DMI Microservice
# Kør disse kommandoer efter at have startet serveren med: npm run dev

echo "=== DMI Microservice Test Eksempler ==="
echo ""

# Test 1: Service info
echo "1. Test service info:"
curl -s "http://localhost:3000/" | jq .
echo ""

# Test 2: Health check
echo "2. Test health check:"
curl -s "http://localhost:3000/api/dmi/health" | jq .
echo ""

# Test 3: Cache statistikker
echo "3. Test cache statistikker:"
curl -s "http://localhost:3000/api/dmi/cache/stats" | jq .
echo ""

# Test 4: Gyldig forespørgsel (København)
echo "4. Test gyldig forespørgsel (København):"
curl -s "http://localhost:3000/api/dmi/point?lat=55.715&lon=12.561" | jq .
echo ""

# Test 4b: Landområde (test bbox fallback)
echo "4b. Test landområde med bbox fallback (Roskilde):"
curl -s "http://localhost:3000/api/dmi/point?lat=55.641&lon=12.080" | jq .
echo ""

# Test 5: Med specifikt tidspunkt
echo "5. Test med specifikt tidspunkt:"
curl -s "http://localhost:3000/api/dmi/point?lat=55.715&lon=12.561&when=2025-01-03T12:00:00Z" | jq .
echo ""

# Test 6: Ugyldig lat
echo "6. Test ugyldig lat:"
curl -s "http://localhost:3000/api/dmi/point?lat=999&lon=12.561" | jq .
echo ""

# Test 7: Manglende lon
echo "7. Test manglende lon:"
curl -s "http://localhost:3000/api/dmi/point?lat=55.715" | jq .
echo ""

# Test 8: Ugyldig when parameter
echo "8. Test ugyldig when parameter:"
curl -s "http://localhost:3000/api/dmi/point?lat=55.715&lon=12.561&when=invalid-date" | jq .
echo ""

# Test 9: Ikke-eksisterende endpoint
echo "9. Test ikke-eksisterende endpoint:"
curl -s "http://localhost:3000/api/dmi/nonexistent" | jq .
echo ""

echo "=== Test færdig ==="
echo ""
echo "For at teste med rigtig DMI data:"
echo "1. Få DMI API nøgle fra: https://confluence.govcloud.dk/pages/viewpage.action?pageId=26476698"
echo "2. Tilføj nøglen til .env filen: DMI_FORECASTEDR_API_KEY=din_nøgle_her"
echo "3. Genstart serveren: npm run dev"
echo "4. Kør test 4 igen for at se rigtig vejrdata"
