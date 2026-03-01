import { ITileStrategy, ITileStrategyContext, ITileStrategyResult, createDefaultResult } from './ITileStrategy';
export class FarmStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.foodGenerated = 4;
    result.maintenance = 2;
    return result;
  }
}
export class CityStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.foodConsumed = 2;
    result.moneyGenerated = 12;
    result.maintenance = 10;
    result.numCities = 1;
    if ((context.state.gridAge[context.key] || 0) > 50 && context.state.resources.happiness > 85) {
      context.state.grid[context.key] = 6;
      context.state.gridAge[context.key] = 0;
      context.pushEvent(`City at (${context.x},${context.y}) evolved into a Skyscraper.`);
    }
    return result;
  }
}
export class IndustryStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.powerDemand = 20;
    result.foodConsumed = 2;
    result.pollution = 2;
    result.maintenance = 20;
    if (context.state.resources.powerCapacity >= context.state.resources.powerDemand) {
      result.moneyGenerated = 45;
    } else {
      if (Math.random() > 0.97) {
        context.pushEvent('Blackout. Industry offline, capacity exceeded.');
      }
      if ((context.state.gridAge[context.key] || 0) > 30) {
        context.state.grid[context.key] = 7;
        context.pushEvent(`Factory at (${context.x},${context.y}) abandoned due to lack of power.`);
      }
    }
    return result;
  }
}
export class RoadStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.maintenance = 1;
    return result;
  }
}
export class PowerPlantStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.powerCapacity = 50;
    result.pollution = 4;
    result.maintenance = 40;
    return result;
  }
}
export class SkyscraperStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.foodConsumed = 6;
    result.moneyGenerated = 65;
    result.maintenance = 35;
    result.numCities = 1;
    return result;
  }
}
export class AbandonedStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.pollution = 2;
    result.maintenance = 3;
    return result;
  }
}
export class ParkStrategy implements ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult {
    const result = createDefaultResult();
    result.pollution = -2;
    result.maintenance = 2;
    return result;
  }
}
