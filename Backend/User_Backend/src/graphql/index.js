import { gql } from 'graphql-tag';
import userSchema from './schemas/user.js';
import classificationSchema from './schemas/classification.js';
import subscriptionSchema from './schemas/subscription.js';
import userResolvers from './resolvers/user.js';
import classificationResolvers from './resolvers/classification.js';
import subscriptionResolvers from './resolvers/subscription.js';

const rootSchema = gql`
  type Query {
    _empty: String
  }
  type Mutation {
    _emptyMutation: String
  }
`;

const typeDefs = [rootSchema, userSchema, classificationSchema, subscriptionSchema];
const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...classificationResolvers.Query,
    ...subscriptionResolvers.Query,
    _empty: () => "This is a placeholder",
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...classificationResolvers.Mutation,
    ...subscriptionResolvers.Mutation,
    _emptyMutation: () => "This is a placeholder",
  },

  User: {
    ...userResolvers.User,
    ...classificationResolvers.User,
  },
};

export { typeDefs, resolvers };