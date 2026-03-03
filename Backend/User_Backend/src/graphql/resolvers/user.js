import User from '../../models/User.js';
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
      return await logIn(Email, Password);
    },
  },
  User: {
    id: (user) => user._id ? user._id.toString() : user.id,
    Created_At: (user) => user.createdAt ? user.createdAt.toISOString() : user.Created_At,
    token: (user) => user.token || null,
  },
};