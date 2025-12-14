import { gql } from 'graphql-tag';

export default gql`
  type User {
    id: ID!
    User_Name: String!
    Email: String!
    Created_At: String!
    token : String
  }

  extend type Query {
    users: [User!]!
    user(id: ID!): User
  }

  extend type Mutation {
    signUp(User_Name: String!, Email: String!, Password: String!): User!
    login(Email: String!, Password: String!): User!
  }
`;