import gql from "graphql-tag";
import { resolvers } from "./resolvers.js";

export const typeDefs = gql`
  type Query {
    hello: String
  }
`;

export { resolvers };
