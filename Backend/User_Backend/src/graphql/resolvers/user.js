import User from '../../models/User.js';
import bcrypt from 'bcryptjs';
import { signUp, logIn } from '../../services/userService.js'; 

export default {
  Query: {
    users: async () => await User.find(),
    user: async (_, { id }) => await User.findById(id),
  },
  Mutation: {
    signUp: async (_, { User_Name, Email, Password }) => {
      const user = await signUp(User_Name, Email, Password);
      return {
        ...user.toObject(),
        id: user._id.toString(),
        Created_At: user.createdAt.toISOString(),
      };
    },
    login: async (_, { Email, Password }) => {
      const user = await logIn(Email, Password);
      return {
        ...user,
        Created_At: (await User.findById(user.id)).createdAt.toISOString(),
      };
    },
  },
  User: {
    id: (user) => user._id.toString(),
    Created_At: (user) => user.createdAt ? user.createdAt.toISOString() : null,
    token: (user) => user.token || null,
  },
};