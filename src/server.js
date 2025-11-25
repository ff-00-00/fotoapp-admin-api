import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import carrerasRoutes from './routes/carreras.js';
import fotografosRoutes from "./routes/fotografos.js";



const app = express();
const prisma = new PrismaClient();
const PgSession = pgSession(session);

// --- DEV BYPASS AUTH: temporal, reversible ---
if (process.env.AUTH_OFF === '1') {
  app.post('/api/auth/login', (req, res) => {
    // crea sesión de dev
    req.session.userId = 1;
    res.json({ ok: true, user: { id: 1, email: 'dev@local' } });
  });

  app.get('/api/auth/me', (req, res) => {
    // siempre responde user válido
    res.json({ id: 1, email: 'dev@local' });
  });

  app.post('/api/auth/logout', (req, res) => {
    // limpia sesión
    req.session.destroy?.(() => { });
    res.json({ ok: true });
  });
}
// --- fin DEV BYPASS AUTH ---


// Seguridad + utilidades
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: true,                 // refleja Origin del request
  credentials: true,            // cookies/sesiones
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());       // <-- responde preflight 204
app.use(express.json());


// Sesiones (tabla de sesiones se crea sola si no existe)
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,           // poner true detrás de HTTPS en producción
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// Rutas
app.use('/api/auth', authRoutes(prisma));
app.use('/api/carreras', carrerasRoutes(prisma));
app.use("/api/fotografos", fotografosRoutes(prisma));

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Arranque
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});