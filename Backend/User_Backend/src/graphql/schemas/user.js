import { gql } from 'graphql-tag';

export default gql`
  type Progress {
    completed: Int!
    total: Int!
  }

  type ExamScore {
    date: String!
    score: Float!
    level: String!
  }

  type User {
    Id: ID!
    User_Name: String!
    Email: String!
    Created_At: String!
    Token: String
    Classifications: [Classification!]

    id: ID!
    username: String!
    email: String!
    createdAt: String!
    token: String
    profileImage: String
    level: String!
    progress: Progress!
    examScores: [ExamScore!]!
  }

  extend type Query {
    Users: [User!]!
    User(Id: ID!): User
  }

  extend type Mutation {
    SignUp(User_Name: String!, Email: String!, Password: String!): User!
    Login(Email: String!, Password: String!): User!
    Refresh_Access_Token: User!
    Logout: Boolean!

    Update_Profile(
      User_Id: ID!
      User_Name: String
      Email: String
      Profile_Image: String
      Level: String
      Progress_Completed: Int
      Progress_Total: Int
    ): User!

    Add_Exam_Score(
      User_Id: ID!
      Score: Float!
      Level: String!
    ): User!

    Change_Password(
      User_Id: ID!
      Current_Password: String!
      New_Password: String!
    ): Boolean!
  }
`;