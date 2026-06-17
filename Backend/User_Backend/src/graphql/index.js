import { gql } from 'graphql-tag';
import userSchema from './schemas/user.js';
import classificationSchema from './schemas/classification.js';
import userResolvers from './resolvers/user.js';
import classificationResolvers from './resolvers/classification.js';

const rootSchema = gql`
  type Query {
    _empty: String
  }
  type Mutation {
    _emptyMutation: String
  }
`;

const typeDefs = [rootSchema, userSchema, classificationSchema];
const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...classificationResolvers.Query,
    _empty: () => "This is a placeholder",
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...classificationResolvers.Mutation,
    _emptyMutation: () => "This is a placeholder",
  },

  User: {
    ...userResolvers.User,
    ...classificationResolvers.User,
  },
};

export { typeDefs, resolvers };