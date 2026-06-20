import mongoose from 'mongoose';

export const ConnectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Mongo Connected');
  } catch (error) {
    console.error('MongoDB connection Error:', error);
    process.exit(1);
  }
};