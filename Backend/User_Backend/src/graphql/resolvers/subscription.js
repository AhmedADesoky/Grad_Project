import {
  getUsage,
  checkLimit,
  checkAndIncrement,
  createCheckoutSession,
  createPortalSession,
} from '../../services/subscriptionService.js';

export default {
  Query: {
    Get_Usage: async (_, { User_Id }) => {
      return getUsage(User_Id);
    },
    Check_Limit: async (_, { User_Id, Counter }) => {
      return checkLimit(User_Id, Counter);
    },
  },

  Mutation: {
    Check_And_Increment: async (_, { User_Id, Counter }) => {
      return checkAndIncrement(User_Id, Counter);
    },

    Create_Checkout_Session: async (_, { User_Id, Price_Id, Success_Url, Cancel_Url }) => {
      return createCheckoutSession(User_Id, Price_Id, Success_Url, Cancel_Url);
    },

    Create_Portal_Session: async (_, { User_Id, Return_Url }) => {
      return createPortalSession(User_Id, Return_Url);
    },
  },
};
