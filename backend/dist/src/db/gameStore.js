"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertUser = upsertUser;
exports.getUserById = getUserById;
exports.getUserGames = getUserGames;
exports.createGame = createGame;
exports.saveGame = saveGame;
exports.deleteGame = deleteGame;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const DB_FILE = path_1.default.join(__dirname, '../../data/games.json');
// Ensure data directory exists
if (!fs_1.default.existsSync(path_1.default.dirname(DB_FILE))) {
    fs_1.default.mkdirSync(path_1.default.dirname(DB_FILE), { recursive: true });
}
function readDB() {
    try {
        const raw = fs_1.default.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return { users: [] };
    }
}
function writeDB(db) {
    fs_1.default.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function upsertUser(googleId, name, email, avatar) {
    const db = readDB();
    let user = db.users.find(u => u.googleId === googleId);
    if (!user) {
        user = { id: (0, uuid_1.v4)(), googleId, name, email, avatar, games: [] };
        db.users.push(user);
    }
    else {
        user.name = name;
        user.email = email;
        user.avatar = avatar;
    }
    writeDB(db);
    return user;
}
function getUserById(id) {
    return readDB().users.find(u => u.id === id) ?? null;
}
function getUserGames(userId) {
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    return user?.games ?? [];
}
function createGame(userId, name) {
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user)
        throw new Error('User not found');
    const game = {
        id: (0, uuid_1.v4)(),
        userId,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tick: 0,
        population: 0,
        money: 800,
        grid: {},
        gridAge: {},
        resources: {},
    };
    user.games.push(game);
    writeDB(db);
    return game;
}
function saveGame(userId, gameId, engineState) {
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user)
        return false;
    const gameIdx = user.games.findIndex(g => g.id === gameId);
    if (gameIdx < 0)
        return false;
    user.games[gameIdx] = {
        ...user.games[gameIdx],
        updatedAt: new Date().toISOString(),
        tick: engineState.tick,
        population: engineState.resources?.population ?? 0,
        money: engineState.resources?.money ?? 0,
        grid: engineState.grid ?? {},
        gridAge: engineState.gridAge ?? {},
        resources: engineState.resources ?? {},
    };
    writeDB(db);
    return true;
}
function deleteGame(userId, gameId) {
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user)
        return false;
    user.games = user.games.filter(g => g.id !== gameId);
    writeDB(db);
    return true;
}
