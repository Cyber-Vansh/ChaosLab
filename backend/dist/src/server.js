"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const SimulationEngine_1 = require("./engine/SimulationEngine");
const GameStore = __importStar(require("./db/gameStore"));
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-prod';
const OAUTH_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET &&
    GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE');
// ─── PASSPORT ────────────────────────────────────────────────────────────────
passport_1.default.serializeUser((user, done) => done(null, user.id));
passport_1.default.deserializeUser((id, done) => {
    const user = GameStore.getUserById(id);
    done(null, user ?? false);
});
if (OAUTH_CONFIGURED) {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: 'http://localhost:3000/auth/google/callback',
    }, (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value ?? '';
        const avatar = profile.photos?.[0]?.value ?? '';
        const user = GameStore.upsertUser(profile.id, profile.displayName, email, avatar);
        done(null, user);
    }));
}
// ─── EXPRESS ─────────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: FRONTEND_URL, credentials: true }));
app.use(express_1.default.json());
app.use((0, express_session_1.default)({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated())
        return next();
    res.status(401).json({ error: 'Not authenticated' });
};
// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.get('/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, user: req.user, oauthConfigured: OAUTH_CONFIGURED });
    }
    else {
        res.json({ authenticated: false, oauthConfigured: OAUTH_CONFIGURED });
    }
});
if (OAUTH_CONFIGURED) {
    app.get('/auth/google', passport_1.default.authenticate('google', { scope: ['profile', 'email'] }));
    app.get('/auth/google/callback', passport_1.default.authenticate('google', { failureRedirect: `${FRONTEND_URL}?auth=failed` }), (_req, res) => res.redirect(`${FRONTEND_URL}?auth=success`));
}
app.post('/auth/logout', (req, res) => {
    req.logout(() => res.json({ success: true }));
});
// ─── GAME SAVE ROUTES ─────────────────────────────────────────────────────────
app.get('/api/games', requireAuth, (req, res) => {
    const user = req.user;
    res.json(GameStore.getUserGames(user.id));
});
app.post('/api/games', requireAuth, (req, res) => {
    const user = req.user;
    const name = req.body.name || `City ${Date.now()}`;
    const game = GameStore.createGame(user.id, name);
    res.json(game);
});
app.delete('/api/games/:id', requireAuth, (req, res) => {
    const user = req.user;
    const ok = GameStore.deleteGame(user.id, String(req.params.id));
    res.json({ success: ok });
});
// ─── SIMULATION ENGINES (one per active session) ─────────────────────────────
// Map: gameId -> SimulationEngine
const engines = new Map();
function getEngine(gameId) {
    if (!engines.has(gameId)) {
        engines.set(gameId, new SimulationEngine_1.SimulationEngine());
    }
    return engines.get(gameId);
}
// Auto-save every 10 seconds for authenticated sessions
// (handled via socket events below)
// ─── HTTP + SOCKET SERVER ─────────────────────────────────────────────────────
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: FRONTEND_URL, credentials: true },
});
// Global "guest" engine for non-authenticated play
const guestEngine = new SimulationEngine_1.SimulationEngine();
setInterval(() => {
    guestEngine.step();
    io.to('guest').emit('stateUpdate', guestEngine.state);
}, 500);
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    let activeGameId = null;
    let engineTimer = null;
    // Join as guest initially
    socket.join('guest');
    socket.emit('stateUpdate', guestEngine.state);
    // Load a specific saved game
    socket.on('loadGame', (data) => {
        const games = GameStore.getUserGames(data.userId);
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
        if (engineTimer)
            clearInterval(engineTimer);
        engineTimer = setInterval(() => {
            engine.step();
            socket.emit('stateUpdate', engine.state);
            // Auto-save every 20 ticks
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
            }
            else {
                io.to('guest').emit('stateUpdate', guestEngine.state);
            }
        }
        else {
            // Still emit so the event log updates
            socket.emit('stateUpdate', engine.state);
        }
    });
    socket.on('resetGame', (data) => {
        const gameId = data?.gameId;
        if (gameId) {
            const engine = engines.get(gameId);
            if (engine)
                engine.reset();
            socket.emit('stateUpdate', engine?.state);
        }
        else {
            // Reset global guest engine
            guestEngine.reset();
            io.to('guest').emit('stateUpdate', guestEngine.state);
        }
    });
    socket.on('disconnect', () => {
        if (engineTimer)
            clearInterval(engineTimer);
        console.log('Client disconnected:', socket.id);
    });
});
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`ChaosLab backend running on http://localhost:${PORT}`);
    console.log(`Google OAuth: ${OAUTH_CONFIGURED ? '✅ Configured' : '⚠️  Not configured (guest mode only)'}`);
});
