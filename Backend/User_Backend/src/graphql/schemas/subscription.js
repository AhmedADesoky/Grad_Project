import { gql } from 'graphql-tag';

export default gql`
  type UsageStat {
    used:  Int!
    limit: Int!
  }

  type UsageStats {
    plans:        UsageStat!
    pdfs:         UsageStat!
    chat:          UsageStat!
    adjustments:  UsageStat!
    mode_changes: UsageStat!
  }

  type UsageResult {
    tier:                    String!
    resets_at:               String!
    subscription_expires_at: String
    usage:                   UsageStats!
  }

  type CheckLimitResult {
    allowed: Boolean!
    used:    Int!
    limit:   Int!
    tier:    String!
  }

  type CheckoutResult {
    url:        String!
    session_id: String!
  }

  type PortalResult {
    url: String!
  }

  extend type Query {
    Get_Usage(User_Id: ID!): UsageResult!
    Check_Limit(User_Id: ID!, Counter: String!): CheckLimitResult!
  }

  extend type Mutation {
    Check_And_Increment(
      User_Id:  ID!
      Counter:  String!
    ): CheckLimitResult!

    Create_Checkout_Session(
      User_Id:     ID!
      Price_Id:    String!
      Success_Url: String!
      Cancel_Url:  String!
    ): CheckoutResult!

    Create_Portal_Session(
      User_Id:    ID!
      Return_Url: String!
    ): PortalResult!
  }
`;
