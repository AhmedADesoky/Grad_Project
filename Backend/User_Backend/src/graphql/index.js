import { gql } from 'graphql-tag';
import userSchema from './schemas/user.js';
import userResolvers from './resolvers/user.js';

const rootSchema = gql`
  type Query {
    _empty: String
  }
  type Mutation {
    _emptyMutation: String
  }
`;

const typeDefs = [rootSchema, userSchema];
const resolvers = {
  Query: {
    ...userResolvers.Query,
    _empty: () => "This is a placeholder",
  },
  Mutation: {
    ...userResolvers.Mutation,
    _emptyMutation: () => "This is a placeholder",
  },

  User: userResolvers.User,
};

export { typeDefs, resolvers };