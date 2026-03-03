import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

async function createTestUser() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('MongoDB Connected');

        // Create a test user
        const testUser = new User({
            User_Name: 'Ahmed',
            Email: 'ahmed@gmail.com',
            Password: 'ahmed123' 
        });

        await testUser.save();
        console.log('✅ Test user created successfully!');
        console.log('Username: Ahmed');
        console.log('Email: ahmed@gmail.com');
        console.log('Password: ahmed123');

        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

createTestUser();
