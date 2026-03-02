import { WorldState } from './WorldState';
import { ITileStrategy, ITileStrategyResult } from './strategies/ITileStrategy';
import {
  FarmStrategy,
  CityStrategy,
  IndustryStrategy,
  RoadStrategy,
  PowerPlantStrategy,
  SkyscraperStrategy,
  AbandonedStrategy,
  ParkStrategy
} from './strategies/ConcreteStrategies';
const GAME_OVER_DEBT_LIMIT = -800;
export class SimulationEngine {
  public state!: WorldState;
  private strategyRegistry: Record<number, ITileStrategy> = {};
  constructor(savedState?: { grid: Record<string, number>; gridAge: Record<string, number>; resources: any }) {
    this.registerStrategies();
    this.reset(savedState);
  }
  private registerStrategies() {
    this.strategyRegistry[1] = new FarmStrategy();
    this.strategyRegistry[2] = new CityStrategy();
    this.strategyRegistry[3] = new IndustryStrategy();
    this.strategyRegistry[4] = new RoadStrategy();
    this.strategyRegistry[5] = new PowerPlantStrategy();
    this.strategyRegistry[6] = new SkyscraperStrategy();
    this.strategyRegistry[7] = new AbandonedStrategy();
    this.strategyRegistry[9] = new ParkStrategy();
  }
  public reset(savedState?: { grid: Record<string, number>; gridAge: Record<string, number>; resources: any }) {
    this.state = new WorldState(
      savedState?.resources,
      savedState?.grid,
      savedState?.gridAge
    );
  }
  public step() {
    if (this.state.isGameOver) return;
    this.state.tick++;
    let totalFoodGenerated = 0;
    let totalFoodConsumed = 0;
    let totalMoneyGenerated = 0;
    let totalMaintenance = 0;
    let powerCapacity = 0;
    let powerDemand = 0;
    let totalPollution = 0;
    let numCities = 0;
    Object.entries(this.state.grid).forEach(([key, type]) => {
      if (type === undefined || type === null) return;
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      if (type > 0) {
        this.state.gridAge[key] = (this.state.gridAge[key] || 0) + 1;
      }
      const strategy = this.strategyRegistry[type];
      if (strategy) {
        const result: ITileStrategyResult = strategy.process({
          state: this.state,
          x,
          y,
          key,
          pushEvent: (msg: string) => this.pushEvent(msg)
        });
        totalFoodGenerated += result.foodGenerated;
        totalFoodConsumed += result.foodConsumed;
        totalMoneyGenerated += result.moneyGenerated;
        totalMaintenance += result.maintenance;
        powerCapacity += result.powerCapacity;
        powerDemand += result.powerDemand;
        totalPollution += result.pollution;
        numCities += result.numCities;
      }
    });
    this.state.resources.powerCapacity = powerCapacity;
    this.state.resources.powerDemand = powerDemand;
    this.state.resources.maintenanceCost = totalMaintenance;
    this.state.resources.pollution = Math.max(0, totalPollution);
    const netIncome = totalMoneyGenerated - totalMaintenance;
    this.state.resources.money += netIncome;
    let targetHappiness = 100 - (totalPollution * 5);
    if (this.state.resources.food === 0 && this.state.resources.population > 0) targetHappiness -= 35;
    if (this.state.resources.money < 0) targetHappiness -= 15;
    this.state.resources.happiness += (targetHappiness - this.state.resources.happiness) * 0.08;
    this.state.resources.happiness = Math.max(0, Math.min(100, this.state.resources.happiness));
    const foodNet = totalFoodGenerated - totalFoodConsumed;
    if (this.state.resources.food + foodNet < 0) {
      this.state.famineStreak++;
      if (this.state.resources.population > 0 && Math.random() > 0.6) {
        this.pushEvent(`Famine alert. Population starvation streak at ${this.state.famineStreak} ticks.`);
      }
      this.state.resources.food = 0;
      this.state.resources.population = Math.max(0, this.state.resources.population - 10);
    } else {
      this.state.famineStreak = 0;
      this.state.resources.food = Math.max(0, this.state.resources.food + foodNet);
      const maxPop = numCities * 80;
      if (this.state.resources.happiness > 50 && this.state.resources.population < maxPop) {
        this.state.resources.population += 1;
      } else if (this.state.resources.happiness < 25 && this.state.resources.population > 0) {
        this.state.resources.population -= 2;
        if (Math.random() > 0.85) this.pushEvent("Citizens emigrating due to low life quality.");
      }
    }
    if (Math.floor(this.state.resources.happiness) === 0) {
      this.state.happinessZeroStreak++;
    } else {
      this.state.happinessZeroStreak = 0;
    }
    if (this.state.tick % 20 === 0 && (totalMoneyGenerated > 0 || totalMaintenance > 0)) {
      const sign = netIncome >= 0 ? '+' : '';
      this.pushEvent(`Income $${totalMoneyGenerated} | Upkeep $${totalMaintenance} | Net ${sign}$${netIncome}`);
    }
    this.checkGameOver();
  }
  private checkGameOver() {
    if (this.state.resources.money < GAME_OVER_DEBT_LIMIT) {
      this.triggerGameOver(`Bankrupt beyond recovery. Accumulated debt limits exceeded.`);
      return;
    }
    if (this.state.famineStreak >= 8 && this.state.resources.population > 0) {
      this.triggerGameOver(`Famine protocol. Population collapsed.`);
      return;
    }
    if (this.state.happinessZeroStreak >= 10) {
      this.triggerGameOver(`Total citizen abandonment due to zero happiness.`);
      return;
    }
  }
  private triggerGameOver(reason: string) {
    this.state.isGameOver = true;
    this.state.gameOverReason = reason;
    this.pushEvent(`GAME OVER: ${reason}`);
  }
  private pushEvent(msg: string) {
    const timestamp = `[T${String(this.state.tick).padStart(4, '0')}]`;
    this.state.events.push(`${timestamp} ${msg}`);
    if (this.state.events.length > 20) this.state.events.shift();
  }
  public handleCommand(action: string, type: string, x: number, y: number): boolean {
    if (this.state.isGameOver) {
      this.pushEvent('Simulation ended.');
      return false;
    }
    const key = `${x},${y}`;
    const currentStatus = this.state.grid[key];
    const isForest = currentStatus === undefined || currentStatus === 8;
    if (action === 'BUILD') {
      if (type === 'CLEAR') {
        if (!isForest) {
          this.pushEvent(`Operation invalid. Coordinate (${x},${y}) is not forested.`);
          return false;
        }
        const cost = 30;
        if (this.state.resources.money >= cost) {
          this.state.resources.money -= cost;
          this.state.grid[key] = 0;
          return true;
        } else {
          this.pushEvent(`Insufficient funds for clearing.`);
          return false;
        }
      }
      if (isForest) {
        this.pushEvent(`Invalid build target. Clear land first.`);
        return false;
      }
      if (type === 'INDUSTRIAL') {
        const hasPower = Object.values(this.state.grid).some(v => v === 5);
        if (!hasPower) {
          this.pushEvent(`Power grid missing. Industry requires active power plant.`);
          return false;
        }
      }
      const COSTS: Record<string, { cost: number; val: number }> = {
        FARM:       { cost: 60,   val: 1 },
        CITY:       { cost: 250,  val: 2 },
        INDUSTRIAL: { cost: 600,  val: 3 },
        ROAD:       { cost: 15,   val: 4 },
        POWER:      { cost: 1200, val: 5 },
        PARK:       { cost: 100,  val: 9 },
        EMPTY:      { cost: 0,    val: 0 },
      };
      const entry = COSTS[type];
      if (!entry) return false;
      const { cost, val } = entry;
      if (this.state.resources.money >= cost) {
        this.state.resources.money -= cost;
        this.state.grid[key] = val;
        this.state.gridAge[key] = 0;
        if (val > 0) this.pushEvent(`Constructed ${type} at (${x},${y}) for $${cost}.`);
        if (val === 0) this.pushEvent(`Demolition complete at (${x},${y}).`);
        return true;
      } else {
        this.pushEvent(`Insufficient funds for ${type}.`);
        return false;
      }
    }
    return false;
  }
  public loadSave(savedGrid: Record<string, number>, savedGridAge: Record<string, number>, savedResources: any) {
    this.state.grid = savedGrid ?? {};
    this.state.gridAge = savedGridAge ?? {};
    if (savedResources) {
      this.state.resources = { ...this.state.resources, ...savedResources };
    }
    this.state.isGameOver = false;
    this.state.gameOverReason = '';
    this.state.famineStreak = 0;
    this.state.happinessZeroStreak = 0;
    this.state.events = [];
  }
}
