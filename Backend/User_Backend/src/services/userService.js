import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const signUp = async ( User_Name, Email, Password ) => {
    const Existing_User_ByEmail = await User.findOne({ Email });

    if (Existing_User_ByEmail) {
        throw new Error('User with this Email already exists');
    }

    const Existing_User_ByName = await User.findOne({ User_Name });

    if (Existing_User_ByName) {
        throw new Error('Username already taken. Please choose a different username.');
    }

    const New_User = new User({ User_Name, Email, Password });

    return await New_User.save();
};


export const logIn = async (Email , Password) => {
    const user = await User.findOne({Email});

    if (!user) {
        throw new Error('User not found');
    }

    const isMatch = await user.comparePassword(Password);
    
    if (!isMatch) {
        throw new Error('Invalid Password');
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    return { 
        id: user._id.toString(), 
        User_Name: user.User_Name, 
        Email: user.Email, 
        Created_At: user.createdAt.toISOString(),
        token 
    };
}