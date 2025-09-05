import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dmiRouter from './router';

// Indlæs miljøvariabler fra .env fil
dotenv.config();

// Opret Express app
const app = express();

// Server konfiguration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware konfiguration
app.use(cors({
  origin: NODE_ENV === 'production' ? false : true, // Tillad alle origins i development
  credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// API routes
app.use('/api/dmi', dmiRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'DMI Microservice',
    version: '1.0.0',
    description: 'DMI Forecast EDR microservice for vind og bølgedata',
    endpoints: {
      // DMI Forecast endpoints
      point: 'GET /api/dmi/point?lat=<num>&lon=<num>[&when=<ISO>]',
      health: 'GET /api/dmi/health',
      cacheStats: 'GET /api/dmi/cache/stats',
      clearCache: 'DELETE /api/dmi/cache'
    },
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint ikke fundet',
    message: `${req.method} ${req.originalUrl} eksisterer ikke`,
    availableEndpoints: [
      'GET /',
      'GET /api/dmi/point',
      'GET /api/dmi/health',
      'GET /api/dmi/cache/stats',
      'DELETE /api/dmi/cache'
    ]
  });
});

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Uventet fejl:', error);
  
  res.status(500).json({
    error: 'Intern server fejl',
    message: NODE_ENV === 'development' ? error.message : 'Der opstod en uventet fejl',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('DMI Microservice startet');
  console.log('='.repeat(50));
  console.log(`Port: ${PORT}`);
  console.log(`Miljø: ${NODE_ENV}`);
  console.log(`DMI Forecast API nøgle: ${process.env.DMI_FORECASTEDR_API_KEY ? 'Ja' : 'Nej'}`);
  console.log('');
  console.log('Tilgængelige endpoints:');
  console.log(`  GET  /                    - Service info`);
  console.log(`  GET  /api/dmi/point       - Hent vind/bølgedata`);
  console.log(`  GET  /api/dmi/health      - DMI health check`);
  console.log(`  GET  /api/dmi/cache/stats - Cache statistikker`);
  console.log(`  DELETE /api/dmi/cache     - Ryd cache`);
  console.log('');
  console.log('Eksempler på brug:');
  console.log(`  curl "http://localhost:${PORT}/api/dmi/point?lat=55.715&lon=12.561"`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM modtaget, lukker server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT modtaget, lukker server...');
  process.exit(0);
});

// Håndter uventede fejl
process.on('uncaughtException', (error) => {
  console.error('Uventet fejl:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Uventet promise rejection:', reason);
  process.exit(1);
});
