import { gql } from 'graphql-tag';

export default gql`
  type Classification_Level {
    Id: ID!
    User_Id: ID!
    Text: String!
    Level: String!
    Confidence: Float!
    Description: String!
    Text_Length: Int!
    Word_Count: Int!
    Probabilities: JSON
    Created_At: String!
    Updated_At: String!
  }
  
  type Classification {
    Id: ID!
    User_Id: ID!
    Text: String!
    Level: String!
    Confidence: Float!
    Description: String!
    Text_Length: Int!
    Word_Count: Int!
    Probabilities: JSON
    Created_At: String!
    Updated_At: String!
  }

  extend type Query {
    Get_User_Classifications(User_Id: ID!, Limit: Int, Offset: Int): [Classification_Level!]!
    Get_Classification_By_Level(User_Id: ID!, Level: String!): [Classification_Level!]!
    Get_Recent_Classifications(User_Id: ID!, Days: Int): [Classification_Level!]!
  }

  extend type Mutation {
    Save_Classification(
      User_Id: ID!
      Text: String!
      Level: String!
      Confidence: Float!
      Description: String!
      Text_Length: Int!
      Word_Count: Int!
      Probabilities: JSON
    ): Classification_Level!
  }
  
  scalar JSON
`;
