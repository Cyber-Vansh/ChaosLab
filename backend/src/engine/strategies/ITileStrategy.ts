import { WorldState } from '../WorldState';
export interface ITileStrategyContext {
  state: WorldState;
  x: number;
  y: number;
  key: string;
  pushEvent: (msg: string) => void;
}
export interface ITileStrategyResult {
  foodGenerated: number;
  foodConsumed: number;
  moneyGenerated: number;
  maintenance: number;
  powerCapacity: number;
  powerDemand: number;
  pollution: number;
  numCities: number;
}
export interface ITileStrategy {
  process(context: ITileStrategyContext): ITileStrategyResult;
}
export const createDefaultResult = (): ITileStrategyResult => ({
  foodGenerated: 0,
  foodConsumed: 0,
  moneyGenerated: 0,
  maintenance: 0,
  powerCapacity: 0,
  powerDemand: 0,
  pollution: 0,
  numCities: 0
});
