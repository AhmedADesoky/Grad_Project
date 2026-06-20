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
    preferredPlanMode: String!
    progress: Progress!
    examScores: [ExamScore!]!
  }

  extend type Query {
    Users: [User!]!
    User(Id: ID!): User
  }

  type SignUpResult {
    requiresVerification: Boolean!
    email: String!
    message: String!
  }

  input ExamAnswerInput {
    Question_Id: String!
    Answer_Text: String!
    Points: Float!
  }

  type ExamQueueResult {
    queued: Boolean!
    jobId: String!
    ai_detected: Boolean
    ai_confidence: Float
  }

  extend type Mutation {
    Submit_Exam(
      User_Id: ID!
      Attempt_Id: String
      Answers: [ExamAnswerInput!]!
    ): ExamQueueResult!

    SignUp(User_Name: String!, Email: String!, Password: String!): SignUpResult!
    Verify_OTP(Email: String!, OTP: String!): User!
    Resend_OTP(Email: String!): Boolean!
    Login(Email: String!, Password: String!): User!
    Refresh_Access_Token: User!
    Logout: Boolean!

    Update_Profile(
      User_Id: ID!
      User_Name: String
      Email: String
      Profile_Image: String
      Level: String
      Preferred_Plan_Mode: String
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

    Request_Password_Reset(Email: String!): Boolean!
    Reset_Password(Token: String!, New_Password: String!): Boolean!
  }
`;