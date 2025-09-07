#!/bin/bash

# Test eksempler for DMI & ORC Microservice
# Kør disse kommandoer efter at have startet serveren med: npm run dev

echo "=== DMI & ORC Microservice Test Eksempler ==="
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
curl -s "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561" | jq .
echo ""

# Test 4b: Landområde (test bbox fallback)
echo "4b. Test landområde med bbox fallback (Roskilde):"
curl -s "http://localhost:3000/api/dmi/forecast?lat=55.641&lon=12.080" | jq .
echo ""

# Test 5: Med custom tidsinterval
echo "5. Test med custom tidsinterval:"
curl -s "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561&fromwhen=2025-01-03T12:00:00Z&towhen=2025-01-04T12:00:00Z" | jq .
echo ""

# Test 6: Ugyldig lat
echo "6. Test ugyldig lat:"
curl -s "http://localhost:3000/api/dmi/forecast?lat=999&lon=12.561" | jq .
echo ""

# Test 7: Manglende lon
echo "7. Test manglende lon:"
curl -s "http://localhost:3000/api/dmi/forecast?lat=55.715" | jq .
echo ""

# Test 8: Ugyldig tidsinterval parameter
echo "8. Test ugyldig tidsinterval parameter:"
curl -s "http://localhost:3000/api/dmi/forecast?lat=55.715&lon=12.561&fromwhen=invalid-date&towhen=2025-01-03T12:00:00Z" | jq .
echo ""

# Test 9: Ikke-eksisterende endpoint
echo "9. Test ikke-eksisterende endpoint:"
curl -s "http://localhost:3000/api/dmi/nonexistent" | jq .
echo ""

echo "=== ORC Optimal Tests ==="
echo ""

# Test 10: ORC health check
echo "10. Test ORC health check:"
curl -s "http://localhost:3000/api/orc/health" | jq .
echo ""

# Test 11: ORC optimal med refNo
echo "11. Test ORC optimal med refNo:"
curl -s "http://localhost:3000/api/orc/optimal?tws=12&refNo=034200028W9" | jq .
echo ""

# Test 12: ORC optimal med sailNo
echo "12. Test ORC optimal med sailNo:"
curl -s "http://localhost:3000/api/orc/optimal?tws=12&sailNo=GRE-49128" | jq .
echo ""

# Test 13: ORC optimal med yachtName og countryId
echo "13. Test ORC optimal med yachtName og countryId:"
curl -s "http://localhost:3000/api/orc/optimal?tws=12&yachtName=OUSYRA&countryId=GRE" | jq .
echo ""

# Test 14: ORC cache statistikker
echo "14. Test ORC cache statistikker:"
curl -s "http://localhost:3000/api/orc/cache/stats" | jq .
echo ""

# Test 15: ORC ugyldig TWS
echo "15. Test ORC ugyldig TWS:"
curl -s "http://localhost:3000/api/orc/optimal?tws=999&refNo=034200028W9" | jq .
echo ""

# Test 16: ORC manglende identifier
echo "16. Test ORC manglende identifier:"
curl -s "http://localhost:3000/api/orc/optimal?tws=12" | jq .
echo ""

echo "=== Test færdig ==="
echo ""
echo "For at teste med rigtig data:"
echo "1. DMI: Få DMI API nøgle fra: https://confluence.govcloud.dk/pages/viewpage.action?pageId=26476698"
echo "2. Tilføj nøglen til .env filen:"
echo "   DMI_FORECASTEDR_API_KEY=din_forecast_nøgle_her"
echo "3. Genstart serveren: npm run dev"
echo "4. Kør test 4 igen for at se rigtig vejrdata"
echo "5. ORC: Bruger offentlig API, ingen nøgle nødvendig"
