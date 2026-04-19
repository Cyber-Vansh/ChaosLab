import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { SimulationEngine } from './engine/SimulationEngine';
import * as GameStore from './db/gameStore';
import { connectDB } from './db/mongoose';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-prod';
const OAUTH_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET &&
  GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE');
passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  const user = await GameStore.getUserById(id);
  done(null, user ?? false);
});
if (OAUTH_CONFIGURED) {
  passport.use(new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:3000/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      const email = profile.emails?.[0]?.value ?? '';
      const avatar = profile.photos?.[0]?.value ?? '';
      const user = await GameStore.upsertUser(profile.id, profile.displayName, email, avatar);
      done(null, user);
    }
  ));
}
const app = express();
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, 
}));
app.use(passport.initialize());
app.use(passport.session());
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
};
app.get('/auth/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ authenticated: true, user: req.user, oauthConfigured: OAUTH_CONFIGURED });
  } else {
    res.json({ authenticated: false, oauthConfigured: OAUTH_CONFIGURED });
  }
});
if (OAUTH_CONFIGURED) {
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}?auth=failed` }),
    (_req, res) => res.redirect(`${FRONTEND_URL}?auth=success`)
  );
}
app.post('/auth/logout', (req, res) => {
  req.logout(() => res.json({ success: true }));
});
app.get('/api/games', requireAuth, async (req, res) => {
  const user = req.user as GameStore.UserProfile;
  res.json(await GameStore.getUserGames(user.id));
});
app.post('/api/games', requireAuth, async (req, res) => {
  const user = req.user as GameStore.UserProfile;
  const name = req.body.name || `City ${Date.now()}`;
  const game = await GameStore.createGame(user.id, name);
  res.json(game);
});
app.delete('/api/games/:id', requireAuth, async (req, res) => {
  const user = req.user as GameStore.UserProfile;
  const ok = await GameStore.deleteGame(user.id, String(req.params.id));
  res.json({ success: ok });
});
const engines = new Map<string, SimulationEngine>();
function getEngine(gameId: string): SimulationEngine {
  if (!engines.has(gameId)) {
    engines.set(gameId, new SimulationEngine());
  }
  return engines.get(gameId)!;
}
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND_URL, credentials: true },
});
const guestEngine = new SimulationEngine();
setInterval(() => {
  guestEngine.step();
  io.to('guest').emit('stateUpdate', guestEngine.state);
}, 500);
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let activeGameId: string | null = null;
  let engineTimer: ReturnType<typeof setInterval> | null = null;
  socket.join('guest');
  socket.emit('stateUpdate', guestEngine.state);
  socket.on('loadGame', async (data: { gameId: string; userId: string }) => {
    const games = await GameStore.getUserGames(data.userId);
    const game = games.find(g => g.id === data.gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    activeGameId = data.gameId;
    socket.leave('guest');
    const engine = getEngine(data.gameId);
    if (game.grid && Object.keys(game.grid).length > 0) {
      engine.loadSave(game.grid, game.gridAge, game.resources);
    }
    if (engineTimer) clearInterval(engineTimer);
    engineTimer = setInterval(() => {
      engine.step();
      socket.emit('stateUpdate', engine.state);
      if (engine.state.tick % 20 === 0) {
        GameStore.saveGame(data.userId, data.gameId, engine.state);
      }
    }, 500);
    socket.emit('stateUpdate', engine.state);
  });
  socket.on('action', (data) => {
    const { action, type, x, y, gameId } = data;
    const engine = gameId ? getEngine(gameId) : guestEngine;
    const success = engine.handleCommand(action, type, x, y);
    if (success) {
      if (gameId) {
        socket.emit('stateUpdate', engine.state);
      } else {
        io.to('guest').emit('stateUpdate', guestEngine.state);
      }
    } else {
      socket.emit('stateUpdate', engine.state);
    }
  });
  socket.on('resetGame', (data?: { gameId?: string }) => {
    const gameId = data?.gameId;
    if (gameId) {
      const engine = engines.get(gameId);
      if (engine) engine.reset();
      socket.emit('stateUpdate', engine?.state);
    } else {
      guestEngine.reset();
      io.to('guest').emit('stateUpdate', guestEngine.state);
    }
  });
  socket.on('disconnect', () => {
    if (engineTimer) clearInterval(engineTimer);
    console.log('Client disconnected:', socket.id);
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await connectDB();
  console.log(`ChaosLab backend running on port ${PORT}`);
  console.log(`Google OAuth: ${OAUTH_CONFIGURED ? '✅ Configured' : '⚠️  Not configured (guest mode only)'}`);
});
