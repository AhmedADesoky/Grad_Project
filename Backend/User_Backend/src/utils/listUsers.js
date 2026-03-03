import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

async function listUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('MongoDB Connected\n');

        const users = await User.find({});
        
        if (users.length === 0) {
            console.log('No users found in database');
        } else {
            console.log(`Found ${users.length} user(s):\n`);
            users.forEach((user, index) => {
                console.log(`User ${index + 1}:`);
                console.log(`  ID: ${user._id}`);
                console.log(`  Username: ${user.User_Name}`);
                console.log(`  Email: ${user.Email}`);
                console.log(`  Created: ${user.createdAt}`);
                console.log('');
            });
        }

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

listUsers();
