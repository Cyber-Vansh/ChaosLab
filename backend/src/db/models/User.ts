import mongoose, { Schema, Document } from 'mongoose';
export interface ISavedGame {
  id: string; 
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tick: number;
  population: number;
  money: number;
  grid: Record<string, number>;
  gridAge: Record<string, number>;
  resources: Record<string, number>;
}
export interface IUser extends Document {
  id: string; 
  googleId: string;
  name: string;
  email: string;
  avatar: string;
  games: ISavedGame[];
}
const SavedGameSchema = new Schema<ISavedGame>({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  tick: { type: Number, default: 0 },
  population: { type: Number, default: 0 },
  money: { type: Number, default: 800 },
  grid: { type: Map, of: Number, default: {} },
  gridAge: { type: Map, of: Number, default: {} },
  resources: { type: Map, of: Number, default: {} }
}, { _id: false });
const UserSchema = new Schema<IUser>({
  id: { type: String, required: true, unique: true },
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  avatar: { type: String, required: true },
  games: { type: [SavedGameSchema], default: [] }
});
export const UserModel = mongoose.model<IUser>('User', UserSchema);
