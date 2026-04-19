import { useState, useRef, useEffect, useCallback } from 'react';
import MapGrid from './components/MapGrid';
interface Resources {
  money: number;
  food: number;
  population: number;
  happiness: number;
  powerCapacity: number;
  powerDemand: number;
  pollution: number;
  maintenanceCost: number;
}
interface GlobalState {
  tick: number;
  resources?: Resources;
  grid: Record<string, number>;
  events: string[];
  isGameOver?: boolean;
  gameOverReason?: string;
}
interface UserProfile { id: string; name: string; email: string; avatar: string; }
interface SavedGame { id: string; name: string; population: number; money: number; updatedAt: string; tick: number; }
function StatCard({ label, value, color, pulse }: { label: string; value: string; color?: string; pulse?: boolean }) {
  return (
    <div className="flex flex-col text-right bg-white/10 border border-white/20 px-4 py-2.5 backdrop-blur-md rounded-lg">
      <span className="text-[8px] text-white/50 uppercase tracking-[0.2em] font-bold mb-0.5">{label}</span>
      <span className={`text-xl font-mono font-bold tabular-nums leading-none ${color ?? 'text-white'} ${pulse ? 'animate-pulse' : ''}`}>{value}</span>
    </div>
  );
}
function MeterBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
const TOOL_META: Record<string, { label: string; cost: string; desc: string }> = {
  CLEAR:      { label: 'Chainsaw', cost: '$30',   desc: 'Clear forest. Required before building.' },
  ROAD:       { label: 'Road',     cost: '$15',   desc: 'Connects the city. Upkeep: $1/tick.' },
  FARM:       { label: 'Farm',     cost: '$60',   desc: '+4 Food/tick. Upkeep: $2/tick.' },
  CITY:       { label: 'City',     cost: '$250',  desc: '+$12 Tax/tick, -2 Food. Upkeep: $10/tick.' },
  INDUSTRIAL: { label: 'Industry', cost: '$600',  desc: '+$45/tick. Requires Power Plant.' },
  POWER:      { label: 'Power',    cost: '$1200', desc: '+50 MW. Upkeep: $40/tick.' },
  PARK:       { label: 'Park',     cost: '$100',  desc: 'Reduces pollution. Upkeep: $2/tick.' },
  EMPTY:      { label: 'Demolish', cost: 'Free',  desc: 'Remove a building.' },
};
function GameSelectScreen({
  user,
  games,
  onSelectGame,
  onNewGame,
  onDeleteGame,
  onLogout,
}: {
  user: UserProfile;
  games: SavedGame[];
  onSelectGame: (id: string, name: string) => void;
  onNewGame: () => void;
  onDeleteGame: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-slate-900 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black text-white tracking-widest uppercase">CHAOSLAB</h1>
            <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Select a World</p>
          </div>
          <div className="flex items-center gap-3">
            {user.avatar && <img src={user.avatar} className="w-9 h-9 rounded-full border-2 border-white/30" alt="avatar" />}
            <div className="text-right">
              <p className="text-white text-sm font-bold">{user.name}</p>
              <button onClick={onLogout} className="text-white/40 hover:text-white/70 text-xs transition">Sign out</button>
            </div>
          </div>
        </div>
        <button
          onClick={onNewGame}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg mb-6 transition flex items-center justify-center gap-2 shadow-xl"
        >
          Start New World
        </button>
        {games.length === 0 ? (
          <p className="text-center text-white/30 py-12">No saved worlds yet. Create your first city!</p>
        ) : (
          <div className="flex flex-col gap-3">
            {games.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(game => (
              <div key={game.id} className="bg-white/10 border border-white/20 rounded-xl p-4 flex items-center gap-4 hover:bg-white/15 transition group">
                <div className="flex-1">
                  <p className="text-white font-bold">{game.name}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    Pop: {(game.population || 0).toLocaleString()} · $${(game.money || 0).toLocaleString()} · Tick {game.tick}
                    · Saved {new Date(game.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => onSelectGame(game.id, game.name)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-bold text-sm transition"
                >
                  Continue →
                </button>
                <button
                  onClick={() => onDeleteGame(game.id)}
                  className="text-white/20 hover:text-red-400 text-xl transition opacity-0 group-hover:opacity-100"
                  title="Delete"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export default function App() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'login' | 'guest' | 'loggedIn' | 'selectGame'>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [games, setGames] = useState<SavedGame[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameName, setActiveGameName] = useState('');
  const [selectedTool, setSelectedTool] = useState('CLEAR');
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [highestPop, setHighestPop] = useState(0);
  const [gameState, setGameState] = useState<GlobalState>({
    tick: 0,
    resources: { money: 800, food: 100, population: 0, happiness: 100, powerCapacity: 0, powerDemand: 0, pollution: 0, maintenanceCost: 0 },
    grid: {},
    events: [],
    isGameOver: false,
  });
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch(`${API_URL}/auth/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        console.log('Auth check response:', data);
        if (data.authenticated && data.user) {
          setUser(data.user);
          setAuthStatus('selectGame');
          fetchGames();
        } else {
          const nextStatus = data.oauthConfigured ? 'login' : 'guest';
          console.log('Setting auth status to:', nextStatus);
          setAuthStatus(nextStatus);
        }
      })
      .catch(err => {
        console.error('Auth check failed:', err);
        setAuthStatus('guest');
      });
  }, []);
  const fetchGames = useCallback(() => {
    fetch(`${API_URL}/api/games`, { credentials: 'include' })
      .then(r => r.json())
      .then(setGames)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', '/');
      fetch(`${API_URL}/auth/status`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.authenticated) {
            setUser(data.user);
            setAuthStatus('selectGame');
            fetchGames();
          }
        });
    }
  }, [fetchGames]);
  const handleNewGame = async () => {
    const name = prompt('Name your world:', `City ${new Date().toLocaleDateString()}`) || 'My City';
    const res = await fetch(`${API_URL}/api/games`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const game = await res.json();
    setActiveGameId(game.id);
    setActiveGameName(game.name);
    setAuthStatus('loggedIn');
    fetchGames();
  };
  const handleSelectGame = (id: string, name: string) => {
    setActiveGameId(id);
    setActiveGameName(name);
    setAuthStatus('loggedIn');
  };
  const handleDeleteGame = async (id: string) => {
    if (!confirm('Delete this world permanently?')) return;
    await fetch(`${API_URL}/api/games/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchGames();
  };
  const handleLogout = async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setActiveGameId(null);
    setAuthStatus('guest');
  };
  const handleRestart = () => {
    setHighestPop(0);
    setGameState(s => ({ ...s, isGameOver: false, gameOverReason: '', events: [] }));
    const sock = (window as any).__chaosSocket;
    if (sock) sock.emit('resetGame', activeGameId ? { gameId: activeGameId } : {});
  };
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [gameState.events]);
  useEffect(() => {
    const pop = gameState.resources?.population ?? 0;
    if (pop > highestPop) setHighestPop(pop);
  }, [gameState.resources?.population]);
  const res = gameState.resources;
  const money = Math.floor(res?.money ?? 0);
  const food = Math.floor(res?.food ?? 0);
  const population = res?.population ?? 0;
  const happiness = Math.floor(res?.happiness ?? 100);
  const pollution = Math.floor(res?.pollution ?? 0);
  const powerDemand = res?.powerDemand ?? 0;
  const powerCapacity = res?.powerCapacity ?? 0;
  const maintenance = res?.maintenanceCost ?? 0;
  const isBroke = money < 0;
  const isBlackout = powerDemand > powerCapacity && powerDemand > 0;
  const isFamine = food === 0 && population > 0;
  const isGameOver = gameState.isGameOver ?? false;
  const moneyColor = money < -200 ? 'text-red-400' : money < 100 ? 'text-amber-400' : 'text-emerald-400';
  let mayorLevel = 'Forest Hermit';
  if (highestPop > 50)   mayorLevel = 'Village Chief';
  if (highestPop > 200)  mayorLevel = 'Town Mayor';
  if (highestPop > 500)  mayorLevel = 'City Governor';
  if (highestPop > 1000) mayorLevel = 'Metro President';
  if (highestPop > 3000) mayorLevel = 'Megalopolis Lord';
  if (highestPop > 8000) mayorLevel = 'The Architect';
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Loading ChaosLab...</div>
      </div>
    );
  }
  if (authStatus === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-5xl font-black text-white mb-4 tracking-tighter">CHAOSLAB</h1>
          <p className="text-emerald-200/60 mb-8 max-w-sm mx-auto">The simulation requires authentication to persist your worlds across sessions.</p>
          <a
            href={`${API_URL}/auth/google`}
            className="inline-flex items-center gap-3 bg-white text-emerald-950 px-8 py-4 rounded-full font-black hover:scale-105 active:scale-95 transition shadow-2xl shadow-emerald-500/20"
          >
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </a>
            <button
              onClick={() => setAuthStatus('guest')}
              className="text-white/40 hover:text-white/70 text-sm transition underline underline-offset-4"
            >
              Play as Guest (no saves)
            </button>
          </div>
        </div>
    );
  }
  if (authStatus === 'selectGame' && user) {
    return (
      <GameSelectScreen
        user={user}
        games={games}
        onSelectGame={handleSelectGame}
        onNewGame={handleNewGame}
        onDeleteGame={handleDeleteGame}
        onLogout={handleLogout}
      />
    );
  }
  return (
    <div className="w-full h-screen overflow-hidden relative font-sans text-slate-900 select-none">
      {}
      <div className="absolute inset-0 z-10 w-full h-full">
        <MapGrid
          selectedTool={selectedTool}
          onStateUpdate={setGameState}
          gameId={activeGameId ?? undefined}
          userId={user?.id}
        />
      </div>
      {}
      {isGameOver && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto">
          <h1 className="text-5xl font-black text-white tracking-widest uppercase text-center max-w-lg mb-4">City Collapsed</h1>
          <p className="text-red-300 mt-4 max-w-md text-center text-base">{gameState.gameOverReason}</p>
          <div className="mt-5 text-slate-400 text-sm">
            Peak population: <span className="text-white font-bold">{highestPop.toLocaleString()}</span>
            {' · '}Rank: <span className="text-amber-400 font-bold">{mayorLevel}</span>
          </div>
          <div className="flex gap-4 mt-10">
            <button onClick={handleRestart} className="px-8 py-4 bg-white text-slate-900 font-black text-lg uppercase rounded-lg hover:bg-slate-100 transition shadow-xl">
              Try Again
            </button>
            {user && (
              <button onClick={() => setAuthStatus('selectGame')} className="px-8 py-4 bg-emerald-700 text-white font-black text-lg uppercase rounded-lg hover:bg-emerald-600 transition shadow-xl">
                My Worlds
              </button>
            )}
          </div>
        </div>
      )}
      {}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-black text-white uppercase tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">CHAOSLAB</h1>
          {activeGameName && <span className="text-xs text-white/50 truncate max-w-[140px]">{activeGameName}</span>}
        </div>
        <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.3em] mt-0.5">{mayorLevel}</p>
        <div className="mt-2 flex flex-col gap-1 pointer-events-auto">
          {isBroke && <div className="bg-red-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded animate-pulse">BANKRUPT — Budget collapsing!</div>}
          {isBlackout && <div className="bg-amber-500/90 text-white text-[10px] font-bold px-2.5 py-1 rounded animate-pulse">BLACKOUT — Build power plants!</div>}
          {isFamine && <div className="bg-orange-700/90 text-white text-[10px] font-bold px-2.5 py-1 rounded animate-pulse">FAMINE — Build farms!</div>}
        </div>
        {}
        <div className="mt-3 w-72 bg-black/70 border border-white/15 backdrop-blur-md rounded-lg pointer-events-auto flex flex-col overflow-hidden">
          <div className="bg-white/5 text-white/40 text-[8px] font-bold tracking-widest uppercase px-3 py-1.5 border-b border-white/10 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            Live Feed · T{String(gameState.tick).padStart(5, '0')}
          </div>
          <div ref={logRef} className="h-48 overflow-y-auto p-2 flex flex-col gap-1 font-mono text-[9px] text-white/60">
            {gameState.events?.length > 0
              ? [...gameState.events].reverse().map((ev, i) => (
                <div key={i} className={`px-1.5 py-0.5 rounded border-l-2 ${
                  ev.includes('Game is over') || ev.includes('Famine') || ev.includes('abandoned') || ev.includes('Bankrupt')
                    ? 'border-red-500 text-red-300'
                    : ev.includes('Power') || ev.includes('leaving') || ev.includes('Blackout')
                    ? 'border-amber-400 text-amber-300'
                    : ev.includes('Built') || ev.includes('Demolished')
                    ? 'border-purple-400 text-purple-300'
                    : ev.includes('cleared')
                    ? 'border-blue-400 text-blue-300'
                    : 'border-white/20'
                }`}>{ev}</div>
              ))
              : <p className="text-white/20 italic text-center mt-8">Simulation connecting...</p>
            }
          </div>
        </div>
        {}
        {user && (
          <button onClick={() => setAuthStatus('selectGame')} className="mt-2 text-white/30 hover:text-white/70 text-[9px] uppercase tracking-widest transition pointer-events-auto">
            ← My Worlds
          </button>
        )}
      </div>
      {}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
        <div className="flex gap-2">
          <StatCard label="Treasury"   value={`$${money.toLocaleString()}`}  color={moneyColor} pulse={money < -200} />
          <StatCard label="Population" value={population.toLocaleString()}   color="text-blue-300" />
          <StatCard label="Food"       value={food.toLocaleString()}          color={isFamine ? 'text-red-400' : food < 20 ? 'text-amber-400' : 'text-green-400'} pulse={isFamine} />
        </div>
        <div className="flex gap-2">
          <StatCard label="Happiness" value={`${happiness}%`} color={happiness < 25 ? 'text-red-400' : happiness < 55 ? 'text-amber-400' : 'text-emerald-400'} />
          <StatCard label="Power"     value={`${powerDemand}/${powerCapacity} MW`} color={isBlackout ? 'text-red-400' : 'text-white'} />
          <StatCard label="Pollution" value={`${pollution}`} color={pollution > 10 ? 'text-red-400' : pollution > 5 ? 'text-amber-400' : 'text-white/60'} />
        </div>
        <div className="w-full bg-black/50 border border-white/10 rounded-lg p-3 flex flex-col gap-2 min-w-[280px]">
          <div>
            <div className="flex justify-between text-[8px] text-white/40 mb-1"><span>HAPPINESS</span><span>{happiness}%</span></div>
            <MeterBar value={happiness} max={100} color={happiness < 30 ? 'bg-red-500' : happiness < 60 ? 'bg-amber-400' : 'bg-emerald-400'} />
          </div>
          <div>
            <div className="flex justify-between text-[8px] text-white/40 mb-1"><span>POLLUTION</span><span>{pollution} units</span></div>
            <MeterBar value={pollution} max={20} color="bg-orange-500" />
          </div>
          <div>
            <div className="flex justify-between text-[8px] text-white/40 mb-1"><span>POWER DEMAND</span><span>{powerDemand}/{powerCapacity} MW</span></div>
            <MeterBar value={powerDemand} max={Math.max(powerCapacity, 1)} color={isBlackout ? 'bg-red-500' : 'bg-blue-400'} />
          </div>
          <div className="pt-1.5 border-t border-white/10 text-[8px] text-white/30 flex justify-between">
            <span>UPKEEP/TICK</span><span className="text-amber-400 font-mono">-${maintenance}</span>
          </div>
        </div>
      </div>
      {}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
        {hoveredTool && (
          <div className="mb-2 text-center bg-black/90 text-white text-xs px-4 py-2 rounded-lg border border-white/20 shadow-xl pointer-events-none">
            <span className="font-bold text-amber-400">{TOOL_META[hoveredTool].cost}</span>
            <span className="mx-2 text-white/30">·</span>
            {TOOL_META[hoveredTool].desc}
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-2.5 bg-black/80 border border-white/15 shadow-2xl rounded-2xl backdrop-blur-md">
          {Object.entries(TOOL_META).map(([id, meta]) => {
            const active = selectedTool === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedTool(id)}
                onMouseEnter={() => setHoveredTool(id)}
                onMouseLeave={() => setHoveredTool(null)}
                className={`flex flex-col items-center justify-center px-4 py-2 rounded-xl text-xs font-bold gap-1 border-2 min-w-[70px] transition-all duration-150 ${
                  active
                    ? 'bg-white text-slate-900 border-white shadow-[0_0_20px_rgba(255,255,255,0.25)]'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:border-white/25'
                }`}
              >
                <span className="text-[10px] uppercase tracking-widest">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
