"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationEngine = void 0;
const WorldState_1 = require("./WorldState");
const GAME_OVER_DEBT_LIMIT = -800; // How broke before losing
class SimulationEngine {
    state;
    constructor(savedState) {
        this.reset(savedState);
    }
    reset(savedState) {
        this.state = new WorldState_1.WorldState(savedState?.resources, savedState?.grid, savedState?.gridAge);
    }
    step() {
        if (this.state.isGameOver)
            return; // Don't tick after game over
        this.state.tick++;
        let totalFoodGenerated = 0;
        let totalFoodConsumed = 0;
        let totalMoneyGenerated = 0;
        let totalMaintenance = 0;
        let powerCapacity = 0;
        let powerDemand = 0;
        let totalPollution = 0;
        let numCities = 0;
        let hasPowerPlant = false;
        Object.entries(this.state.grid).forEach(([key, type]) => {
            if (type === undefined || type === null)
                return;
            const [xStr, yStr] = key.split(',');
            const x = parseInt(xStr, 10);
            const y = parseInt(yStr, 10);
            if (type > 0) {
                this.state.gridAge[key] = (this.state.gridAge[key] || 0) + 1;
            }
            if (type === 1) {
                // Farm: cheap upkeep, good food
                totalFoodGenerated += 4;
                totalMaintenance += 2;
            }
            else if (type === 2) {
                // City: modest tax, moderate food drain
                totalFoodConsumed += 2;
                totalMoneyGenerated += 12;
                totalMaintenance += 10;
                numCities++;
                // Evolve into Skyscraper (tick 50, happiness > 85)
                if ((this.state.gridAge[key] || 0) > 50 && this.state.resources.happiness > 85) {
                    this.state.grid[key] = 6;
                    this.state.gridAge[key] = 0;
                    this.pushEvent(`🏙️ City at (${x},${y}) evolved into a Skyscraper!`);
                }
            }
            else if (type === 3) {
                // Industrial: needs power, pollutes
                powerDemand += 20;
                totalFoodConsumed += 2;
                totalPollution += 2;
                totalMaintenance += 20;
                const isPowered = powerCapacity >= powerDemand; // approx — recalculated below fully
                if (this.state.resources.powerCapacity >= this.state.resources.powerDemand) {
                    totalMoneyGenerated += 45;
                }
                else {
                    if (Math.random() > 0.97)
                        this.pushEvent("⚡ Blackout! Industry offline — build more power plants.");
                    if ((this.state.gridAge[key] || 0) > 30) {
                        this.state.grid[key] = 7;
                        this.pushEvent(`🏚️ Factory at (${x},${y}) abandoned — no power for too long!`);
                    }
                }
            }
            else if (type === 4) {
                // Road: cheap upkeep
                totalMaintenance += 1;
            }
            else if (type === 5) {
                // Power Plant
                powerCapacity += 50;
                hasPowerPlant = true;
                totalPollution += 4;
                totalMaintenance += 40;
            }
            else if (type === 6) {
                // Skyscraper
                totalFoodConsumed += 6;
                totalMoneyGenerated += 65;
                totalMaintenance += 35;
                numCities++;
            }
            else if (type === 7) {
                // Abandoned Factory — just leaks pollution and costs cleanup
                totalPollution += 2;
                totalMaintenance += 3;
            }
            else if (type === 9) {
                // Park — removes pollution, adds happiness indirectly through less pollution
                totalPollution -= 2;
                totalMaintenance += 2;
            }
        });
        this.state.resources.powerCapacity = powerCapacity;
        this.state.resources.powerDemand = powerDemand;
        this.state.resources.maintenanceCost = totalMaintenance;
        this.state.resources.pollution = Math.max(0, totalPollution);
        // Net money
        const netIncome = totalMoneyGenerated - totalMaintenance;
        this.state.resources.money += netIncome;
        // Happiness
        let targetHappiness = 100 - (totalPollution * 5);
        if (this.state.resources.food === 0 && this.state.resources.population > 0)
            targetHappiness -= 35;
        if (this.state.resources.money < 0)
            targetHappiness -= 15;
        this.state.resources.happiness += (targetHappiness - this.state.resources.happiness) * 0.08;
        this.state.resources.happiness = Math.max(0, Math.min(100, this.state.resources.happiness));
        // Food logic
        const foodNet = totalFoodGenerated - totalFoodConsumed;
        if (this.state.resources.food + foodNet < 0) {
            this.state.famineStreak++;
            if (this.state.resources.population > 0 && Math.random() > 0.6) {
                this.pushEvent(`🌾 Famine! Population dying. (${this.state.famineStreak} ticks)`);
            }
            this.state.resources.food = 0;
            this.state.resources.population = Math.max(0, this.state.resources.population - 10);
        }
        else {
            this.state.famineStreak = 0;
            this.state.resources.food = Math.max(0, this.state.resources.food + foodNet);
            const maxPop = numCities * 80;
            if (this.state.resources.happiness > 50 && this.state.resources.population < maxPop) {
                this.state.resources.population += 1;
            }
            else if (this.state.resources.happiness < 25 && this.state.resources.population > 0) {
                this.state.resources.population -= 2;
                if (Math.random() > 0.85)
                    this.pushEvent("😤 Citizens leaving — live conditions terrible!");
            }
        }
        // Happiness zero streak
        if (Math.floor(this.state.resources.happiness) === 0) {
            this.state.happinessZeroStreak++;
        }
        else {
            this.state.happinessZeroStreak = 0;
        }
        // Periodic summary
        if (this.state.tick % 20 === 0 && (totalMoneyGenerated > 0 || totalMaintenance > 0)) {
            const sign = netIncome >= 0 ? '+' : '';
            this.pushEvent(`Income $${totalMoneyGenerated} | Upkeep $${totalMaintenance} | Net ${sign}$${netIncome}`);
        }
        // ── GAME OVER CHECKS ──
        this.checkGameOver();
    }
    checkGameOver() {
        // 1. Bankruptcy beyond the limit
        if (this.state.resources.money < GAME_OVER_DEBT_LIMIT) {
            this.triggerGameOver(`Bankrupt beyond recovery (debt exceeds $${Math.abs(GAME_OVER_DEBT_LIMIT)})`);
            return;
        }
        // 2. Sustained famine (8 consecutive ticks)
        if (this.state.famineStreak >= 8 && this.state.resources.population > 0) {
            this.triggerGameOver(`Famine wiped out your population after ${this.state.famineStreak} ticks of starvation`);
            return;
        }
        // 3. Happiness at zero for 10 consecutive ticks
        if (this.state.happinessZeroStreak >= 10) {
            this.triggerGameOver(`Citizens completely abandoned the city — happiness at 0% for ${this.state.happinessZeroStreak} ticks`);
            return;
        }
    }
    triggerGameOver(reason) {
        this.state.isGameOver = true;
        this.state.gameOverReason = reason;
        this.pushEvent(`GAME OVER: ${reason}`);
    }
    pushEvent(msg) {
        const timestamp = `[T${String(this.state.tick).padStart(4, '0')}]`;
        this.state.events.push(`${timestamp} ${msg}`);
        if (this.state.events.length > 20)
            this.state.events.shift();
    }
    handleCommand(action, type, x, y) {
        if (this.state.isGameOver) {
            this.pushEvent('Game is over. Start a new world.');
            return false;
        }
        const key = `${x},${y}`;
        const currentStatus = this.state.grid[key];
        const isForest = currentStatus === undefined || currentStatus === 8;
        if (action === 'BUILD') {
            if (type === 'CLEAR') {
                if (!isForest) {
                    this.pushEvent(`Not a forest tile at (${x},${y}).`);
                    return false;
                }
                const cost = 30; // Down from $50 — easier to start
                if (this.state.resources.money >= cost) {
                    this.state.resources.money -= cost;
                    this.state.grid[key] = 0;
                    return true;
                }
                else {
                    this.pushEvent(`Need $${cost} to clear forest. You have $${Math.floor(this.state.resources.money)}.`);
                    return false;
                }
            }
            if (isForest) {
                this.pushEvent(`Clear the forest first! Use the Chainsaw tool.`);
                return false;
            }
            // ── INDUSTRIAL requires at least one Power Plant on the map ──
            if (type === 'INDUSTRIAL') {
                const hasPower = Object.values(this.state.grid).some(v => v === 5);
                if (!hasPower) {
                    this.pushEvent(`Cannot build Industry without a Power Plant! Build one first.`);
                    return false;
                }
            }
            const COSTS = {
                FARM: { cost: 60, val: 1 },
                CITY: { cost: 250, val: 2 },
                INDUSTRIAL: { cost: 600, val: 3 },
                ROAD: { cost: 15, val: 4 },
                POWER: { cost: 1200, val: 5 },
                PARK: { cost: 100, val: 9 },
                EMPTY: { cost: 0, val: 0 },
            };
            const entry = COSTS[type];
            if (!entry)
                return false;
            const { cost, val } = entry;
            if (this.state.resources.money >= cost) {
                this.state.resources.money -= cost;
                this.state.grid[key] = val;
                this.state.gridAge[key] = 0;
                if (val > 0)
                    this.pushEvent(`Built ${type} at (${x},${y}) for $${cost}`);
                if (val === 0)
                    this.pushEvent(`Demolished at (${x},${y})`);
                return true;
            }
            else {
                this.pushEvent(`Need $${cost} for ${type}. You have $${Math.floor(this.state.resources.money)}.`);
                return false;
            }
        }
        return false;
    }
    loadSave(savedGrid, savedGridAge, savedResources) {
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
exports.SimulationEngine = SimulationEngine;
