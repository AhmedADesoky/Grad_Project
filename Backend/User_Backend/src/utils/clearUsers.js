import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function clearUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('MongoDB Connected');

        const result = await mongoose.connection.db.collection('users').deleteMany({});
        console.log(`Deleted ${result.deletedCount} users from the database`);

        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

clearUsers();
