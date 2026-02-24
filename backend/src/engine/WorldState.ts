export interface Resources {
  money: number;
  food: number;
  population: number;
  happiness: number;
  powerCapacity: number;
  powerDemand: number;
  pollution: number;
  maintenanceCost: number;
}
export class WorldState {
  public grid: Record<string, number>;
  public gridAge: Record<string, number>;
  public tick: number;
  public resources: Resources;
  public events: string[];
  public isGameOver: boolean;
  public gameOverReason: string;
  public famineStreak: number;
  public happinessZeroStreak: number;
  constructor(initialResources?: Partial<Resources>, initialGrid?: Record<string, number>, initialGridAge?: Record<string, number>) {
    this.grid = initialGrid ?? {};
    this.gridAge = initialGridAge ?? {};
    this.tick = 0;
    this.events = [];
    this.isGameOver = false;
    this.gameOverReason = '';
    this.famineStreak = 0;
    this.happinessZeroStreak = 0;
    this.resources = {
      money: 800,           
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
