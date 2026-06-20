import { graphQLRequest } from './Client';

const USER_URL = import.meta.env.VITE_USER_GRAPHQL_URL;

/**
 * Sign up a new user
 * @param {Object} params - User signup parameters
 * @param {string} params.User_Name - User's full name
 * @param {string} params.Email - User's email address
 * @param {string} params.Password - User's password
 * @returns {Promise<Object>} User data including token and profile
 */
export async function signUpUser({ User_Name, Email, Password }) {
  const query = `
    mutation SignUp($User_Name: String!, $Email: String!, $Password: String!) {
      SignUp(User_Name: $User_Name, Email: $Email, Password: $Password) {
        requiresVerification
        email
        message
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { User_Name, Email, Password },
  });

  return data.SignUp;
}

export async function verifyOTP({ Email, OTP }) {
  const query = `
    mutation VerifyOTP($Email: String!, $OTP: String!) {
      Verify_OTP(Email: $Email, OTP: $OTP) {
        Id
        User_Name
        Email
        Created_At
        id
        username
        email
        createdAt
        token
        profileImage
        level
        preferredPlanMode
        progress {
          completed
          total
        }
        examScores {
          date
          score
          level
        }
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { Email, OTP },
  });

  return data.Verify_OTP;
}

export async function resendOTP({ Email }) {
  const query = `
    mutation ResendOTP($Email: String!) {
      Resend_OTP(Email: $Email)
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { Email },
  });

  return data.Resend_OTP;
}

/**
 * Login existing user
 * @param {Object} params - User login parameters
 * @param {string} params.Email - User's email address
 * @param {string} params.Password - User's password
 * @returns {Promise<Object>} User data including token and profile
 */
export async function loginUser({ Email, Password }) {
  const query = `
    mutation Login($Email: String!, $Password: String!) {
      Login(Email: $Email, Password: $Password) {
        Id
        User_Name
        Email
        Token
        Created_At
        id
        username
        email
        createdAt
        token
        profileImage
        level
        preferredPlanMode
        progress {
          completed
          total
        }
        examScores {
          date
          score
          level
        }
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { Email, Password },
  });

  return data.Login;
}

/**
 * Refresh access token
 * @returns {Promise<Object>} Refreshed user data with new token
 */
export async function refreshAccessToken() {
  const query = `
    mutation {
      Refresh_Access_Token {
        Id
        User_Name
        Email
        Token
        Created_At
        id
        username
        email
        createdAt
        token
        profileImage
        level
        preferredPlanMode
        progress {
          completed
          total
        }
        examScores {
          date
          score
          level
        }
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
  });

  return data.Refresh_Access_Token;
}

/**
 * Logout current user
 * @returns {Promise<boolean>} Logout success status
 */
export async function logoutUser() {
  const query = `
    mutation {
      Logout
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
  });

  return data.Logout;
}

/**
 * Update user profile information
 * @param {Object} params - Profile update parameters
 * @param {string} params.User_Id - User's ID
 * @param {string} [params.User_Name] - New username
 * @param {string} [params.Email] - New email address
 * @param {string} [params.Profile_Image] - Base64 encoded profile image
 * @param {string} [params.Level] - User's CEFR level (A1-C2)
 * @param {number} [params.Progress_Completed] - Number of completed tasks
 * @param {number} [params.Progress_Total] - Total number of tasks
 * @returns {Promise<Object>} Updated user data
 */
export async function updateUserProfile({
  User_Id,
  User_Name,
  Email,
  Profile_Image,
  Level,
  Preferred_Plan_Mode,
  Progress_Completed,
  Progress_Total,
}) {
  const query = `
    mutation UpdateProfile(
      $User_Id: ID!
      $User_Name: String
      $Email: String
      $Profile_Image: String
      $Level: String
      $Preferred_Plan_Mode: String
      $Progress_Completed: Int
      $Progress_Total: Int
    ) {
      Update_Profile(
        User_Id: $User_Id
        User_Name: $User_Name
        Email: $Email
        Profile_Image: $Profile_Image
        Level: $Level
        Preferred_Plan_Mode: $Preferred_Plan_Mode
        Progress_Completed: $Progress_Completed
        Progress_Total: $Progress_Total
      ) {
        Id
        User_Name
        Email
        id
        username
        email
        profileImage
        level
        preferredPlanMode
        progress {
          completed
          total
        }
        examScores {
          date
          score
          level
        }
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: {
      User_Id,
      User_Name,
      Email,
      Profile_Image,
      Level,
      Preferred_Plan_Mode,
      Progress_Completed,
      Progress_Total,
    },
  });

  return data.Update_Profile;
}

/**
 * Change user password
 * @param {Object} params - Password change parameters
 * @param {string} params.User_Id - User's ID
 * @param {string} params.Current_Password - Current password
 * @param {string} params.New_Password - New password (min 8 characters)
 * @returns {Promise<boolean>} Password change success status
 */
export async function changeUserPassword({ User_Id, Current_Password, New_Password }) {
  const query = `
    mutation ChangePassword($User_Id: ID!, $Current_Password: String!, $New_Password: String!) {
      Change_Password(User_Id: $User_Id, Current_Password: $Current_Password, New_Password: $New_Password)
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { User_Id, Current_Password, New_Password },
  });

  return data.Change_Password;
}

/**
 * Add exam score for user
 * @param {Object} params - Exam score parameters
 * @param {string} params.User_Id - User's ID
 * @param {number} params.Score - Exam score percentage (0-100)
 * @param {string} params.Level - CEFR level achieved (A1-C2)
 * @returns {Promise<Object>} Updated user data with new exam score
 */
export async function submitExam({ User_Id, Attempt_Id, Answers }) {
  const query = `
    mutation SubmitExam($User_Id: ID!, $Attempt_Id: String, $Answers: [ExamAnswerInput!]!) {
      Submit_Exam(User_Id: $User_Id, Attempt_Id: $Attempt_Id, Answers: $Answers) {
        queued
        jobId
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { User_Id, Attempt_Id, Answers },
  });

  return data.Submit_Exam;
}

export async function addExamScore({ User_Id, Score, Level }) {
  const query = `
    mutation AddExamScore($User_Id: ID!, $Score: Float!, $Level: String!) {
      Add_Exam_Score(User_Id: $User_Id, Score: $Score, Level: $Level) {
        Id
        User_Name
        id
        username
        level
        examScores { 
          date 
          score 
          level 
        }
      }
    }
  `;

  const data = await graphQLRequest({
    url: USER_URL,
    query,
    variables: { User_Id, Score, Level },
  });

  return data.Add_Exam_Score;
}

// ── Subscription & Usage ───────────────────────────────────────────────────────

export async function getUsage({ User_Id }) {
  const query = `
    query GetUsage($User_Id: ID!) {
      Get_Usage(User_Id: $User_Id) {
        tier
        resets_at
        subscription_expires_at
        usage {
          plans        { used limit }
          pdfs         { used limit }
          chat         { used limit }
          adjustments  { used limit }
          mode_changes { used limit }
        }
      }
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { User_Id } });
  return data.Get_Usage;
}

export async function checkLimit({ User_Id, Counter }) {
  const query = `
    query CheckLimit($User_Id: ID!, $Counter: String!) {
      Check_Limit(User_Id: $User_Id, Counter: $Counter) {
        allowed
        used
        limit
        tier
      }
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { User_Id, Counter } });
  return data.Check_Limit;
}

export async function checkAndIncrement({ User_Id, Counter }) {
  const query = `
    mutation CheckAndIncrement($User_Id: ID!, $Counter: String!) {
      Check_And_Increment(User_Id: $User_Id, Counter: $Counter) {
        allowed
        used
        limit
        tier
      }
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { User_Id, Counter } });
  return data.Check_And_Increment;
}

export async function createCheckoutSession({ User_Id, Price_Id, Success_Url, Cancel_Url }) {
  const query = `
    mutation CreateCheckoutSession($User_Id: ID!, $Price_Id: String!, $Success_Url: String!, $Cancel_Url: String!) {
      Create_Checkout_Session(User_Id: $User_Id, Price_Id: $Price_Id, Success_Url: $Success_Url, Cancel_Url: $Cancel_Url) {
        url
        session_id
      }
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { User_Id, Price_Id, Success_Url, Cancel_Url } });
  return data.Create_Checkout_Session;
}

export async function createPortalSession({ User_Id, Return_Url }) {
  const query = `
    mutation CreatePortalSession($User_Id: ID!, $Return_Url: String!) {
      Create_Portal_Session(User_Id: $User_Id, Return_Url: $Return_Url) {
        url
      }
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { User_Id, Return_Url } });
  return data.Create_Portal_Session;
}

export async function requestPasswordReset({ Email }) {
  const query = `
    mutation RequestPasswordReset($Email: String!) {
      Request_Password_Reset(Email: $Email)
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { Email } });
  return data.Request_Password_Reset;
}

export async function resetPassword({ Token, New_Password }) {
  const query = `
    mutation ResetPassword($Token: String!, $New_Password: String!) {
      Reset_Password(Token: $Token, New_Password: $New_Password)
    }
  `;
  const data = await graphQLRequest({ url: USER_URL, query, variables: { Token, New_Password } });
  return data.Reset_Password;
}
