"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldState = void 0;
class WorldState {
    grid;
    gridAge;
    tick;
    resources;
    events;
    isGameOver;
    gameOverReason;
    // Streak counters for sustained conditions
    famineStreak;
    happinessZeroStreak;
    constructor(initialResources, initialGrid, initialGridAge) {
        this.grid = initialGrid ?? {};
        this.gridAge = initialGridAge ?? {};
        this.tick = 0;
        this.events = [];
        this.isGameOver = false;
        this.gameOverReason = '';
        this.famineStreak = 0;
        this.happinessZeroStreak = 0;
        this.resources = {
            money: 800, // Rebalanced: enough to make a good start
            food: 100,
            population: 0,
            happiness: 100,
            powerCapacity: 0,
            powerDemand: 0,
            pollution: 0,
            maintenanceCost: 0,
            ...initialResources,
        };
    }
}
exports.WorldState = WorldState;
