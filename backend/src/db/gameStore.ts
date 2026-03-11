import { v4 as uuidv4 } from 'uuid';
import { UserModel, IUser, ISavedGame } from './models/User';
export type SavedGame = ISavedGame;
export type UserProfile = IUser;
export async function upsertUser(googleId: string, name: string, email: string, avatar: string): Promise<UserProfile> {
  let user = await UserModel.findOne({ googleId });
  if (!user) {
    user = await UserModel.create({
      id: uuidv4(),
      googleId,
      name,
      email,
      avatar,
      games: []
    });
  } else {
    user.name = name;
    user.email = email;
    user.avatar = avatar;
    await user.save();
  }
  return user.toJSON() as UserProfile;
}
export async function getUserById(id: string): Promise<UserProfile | null> {
  return await UserModel.findOne({ id }).lean() as UserProfile | null;
}
export async function getUserGames(userId: string): Promise<SavedGame[]> {
  const user = await UserModel.findOne({ id: userId }).lean();
  return (user?.games as SavedGame[]) ?? [];
}
export async function createGame(userId: string, name: string): Promise<SavedGame> {
  const user = await UserModel.findOne({ id: userId });
  if (!user) throw new Error('User not found');
  const game: SavedGame = {
    id: uuidv4(),
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
  await user.save();
  return game;
}
export async function saveGame(userId: string, gameId: string, engineState: any): Promise<boolean> {
  const user = await UserModel.findOne({ id: userId });
  if (!user) return false;
  const gameIdx = user.games.findIndex(g => g.id === gameId);
  if (gameIdx < 0) return false;
  const updatedGame = {
    ...(user.games[gameIdx] as any).toObject(),
    updatedAt: new Date().toISOString(),
    tick: engineState.tick,
    population: engineState.resources?.population ?? 0,
    money: engineState.resources?.money ?? 0,
    grid: engineState.grid ?? {},
    gridAge: engineState.gridAge ?? {},
    resources: engineState.resources ?? {},
  };
  user.games[gameIdx] = updatedGame as ISavedGame;
  await user.save();
  return true;
}
export async function deleteGame(userId: string, gameId: string): Promise<boolean> {
  const user = await UserModel.findOne({ id: userId });
  if (!user) return false;
  user.games = user.games.filter(g => g.id !== gameId);
  await user.save();
  return true;
}
