import mongoose from 'mongoose';
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI not found in environment. Using in-memory fallback connection (Local MongoDB expected on port 27017)');
  }
  const connectionString = uri || 'mongodb://127.0.0.1:27017/chaoslab';
  try {
    await mongoose.connect(connectionString);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
}
