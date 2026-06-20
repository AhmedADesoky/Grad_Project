import { graphQLRequest } from './Client';

const AI_URL = import.meta.env.VITE_AI_GRAPHQL_URL;

function parseJsonField(value, fallback = null) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        return JSON.parse(parsed);
      }
      return parsed;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// ─── EXAM ────────────────────────────────────────────────────────────────────

export async function generateExamQuestions({ User_Id, Level = 'A1', Count = 4, Duration_Minutes = 45 }) {
  const query = `
    mutation GenerateExam($User_Id: String!, $Level: String, $Count: Int, $Duration_Minutes: Int) {
      Generate_Exam_Questions(User_Id: $User_Id, Level: $Level, Count: $Count, Duration_Minutes: $Duration_Minutes) {
        Success
        Attempt_Id
        Started_At
        Expires_At
        Duration_Minutes
        Questions {
          Id
          Question
          Points
        }
        Error
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Level, Count, Duration_Minutes },
  });
  return data.Generate_Exam_Questions;
}

export async function evaluateExam({ User_Id, Attempt_Id, Answers, Save_To_Database = true }) {
  const query = `
    mutation EvaluateExam(
      $User_Id: String!,
      $Attempt_Id: String,
      $Answers: [Exam_Answer_Input!]!,
      $Save_To_Database: Boolean
    ) {
      Evaluate_Exam(
        User_Id: $User_Id,
        Attempt_Id: $Attempt_Id,
        Answers: $Answers,
        Save_To_Database: $Save_To_Database
      ) {
        Success
        Attempt_Id
        Submitted_At
        Is_Expired
        Auto_Submitted
        Final_Level
        Final_Confidence
        Total_Score
        Percentage
        Passed
        Question_Results {
          Question_Id
          Points
          Awarded_Points
          Classification_Level
          Classification_Confidence
          Classification_Description
          Feedback_Overall_Score
          Feedback_Grammar_Score
          Feedback_Vocab_Score
          Feedback_Punct_Score
          Feedback_Spelling_Score
          Feedback_Corrected_Text
          Feedback_Detected_Issues
          Answer_Text
        }
        AI_Detected
        AI_Confidence
        Error
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Attempt_Id, Answers, Save_To_Database },
  });
  return data.Evaluate_Exam;
}

export async function getUserExamAttempts({ User_Id, Limit = 50 }) {
  const query = `
    query UserExamAttempts($User_Id: String!, $Limit: Int) {
      Get_User_Exam_Attempts(User_Id: $User_Id, Limit: $Limit) {
        Attempt_Id
        User_Id
        Level
        Duration_Minutes
        Started_At
        Expires_At
        Submitted_At
        Status
        Auto_Submitted
        Total_Points
        Total_Score
        Percentage
        Passed
        Final_Level
        Final_Confidence
        Created_At
        Updated_At
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Limit },
  });
  return data.Get_User_Exam_Attempts || [];
}

export async function getExamAttemptById({ Attempt_Id }) {
  const query = `
    query GetExamAttempt($Attempt_Id: String!) {
      Get_Exam_Attempt(Attempt_Id: $Attempt_Id) {
        Attempt_Id
        User_Id
        Level
        Duration_Minutes
        Started_At
        Expires_At
        Submitted_At
        Status
        Auto_Submitted
        Questions
        Answers
        Question_Results
        Total_Points
        Total_Score
        Percentage
        Passed
        Final_Level
        Final_Confidence
        AI_Detected
        AI_Confidence
        Created_At
        Updated_At
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { Attempt_Id },
  });

  const raw = data?.Get_Exam_Attempt;
  if (!raw) return null;

  return {
    ...raw,
    Questions: parseJsonField(raw.Questions, []),
    Answers: parseJsonField(raw.Answers, []),
    Question_Results: parseJsonField(raw.Question_Results, []),
  };
}

// ─── FEEDBACK & CLASSIFICATIONS ───────────────────────────────────────────────

export async function getUserActivityDates({ User_Id, Days = 120, Mode }) {
  const query = `
    query GetUserActivityDates($User_Id: String!, $Days: Int, $Mode: String) {
      Get_User_Activity_Dates(User_Id: $User_Id, Days: $Days, Mode: $Mode)
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Days, Mode } });
  return data.Get_User_Activity_Dates || [];
}

export async function getUserFeedback({ User_Id, Limit = 30, Offset = 0 }) {
  const query = `
    query UserFeedback($User_Id: String!, $Limit: Int, $Offset: Int) {
      Get_User_Feedback(User_Id: $User_Id, Limit: $Limit, Offset: $Offset) {
        Id
        Overall_Score
        Grammar_Score
        Vocab_Score
        Punct_Score
        Created_At
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Limit, Offset } });
  return data.Get_User_Feedback || [];
}

export async function getRecentClassifications({ User_Id, Days = 30 }) {
  const query = `
    query RecentClasses($User_Id: String!, $Days: Int) {
      Get_Recent_Classifications(User_Id: $User_Id, Days: $Days) {
        Id
        Level
        Confidence
        Created_At
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Days } });
  return data.Get_Recent_Classifications || [];
}

export async function analyzePdfDocument({
  Pdf_Base64,
  Pdf_Path,
  Pdf_Url,
  File_Name,
  User_Id,
  Save_To_Database = true,
  Use_OCR = true,
}) {
  const query = `
    mutation AnalyzePdfDocument(
      $Pdf_Base64: String,
      $Pdf_Path: String,
      $Pdf_Url: String,
      $File_Name: String,
      $User_Id: String,
      $Save_To_Database: Boolean!,
      $Use_OCR: Boolean!
    ) {
      Analyze_PDF_Document(
        Pdf_Base64: $Pdf_Base64
        Pdf_Path: $Pdf_Path
        Pdf_Url: $Pdf_Url
        File_Name: $File_Name
        User_Id: $User_Id
        Save_To_Database: $Save_To_Database
        Use_OCR: $Use_OCR
      ) {
        Success
        Error
        Result {
          Analysis_Id
          User_Id
          Pdf_Url
          Pdf_Storage_Path
          File_Name
          Page_Count
          Extraction_Tool
          Page_Results
          Clean_Text
          Classification {
            Level
            Confidence
            Description
            Probabilities
          }
          Feedback {
            Corrected_Text
            Overall_Score
            Grammar_Score
            Vocab_Score
            Punct_Score
            Detected_Issues
            Errors
            Error_Trend
            Dominant_Error
            Severity
            Fluency
            Feedback_Text
          }
          Status
          Error_Message
          Created_At
          Updated_At
        }
      }
    }
  `;

  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: {
      Pdf_Base64,
      Pdf_Path,
      Pdf_Url,
      File_Name,
      User_Id,
      Save_To_Database,
      Use_OCR,
    },
  });

  return data.Analyze_PDF_Document;
}

export async function getUserDocumentAnalyses({ User_Id, Limit = 20, Offset = 0 }) {
  const query = `
    query GetUserDocumentAnalyses($User_Id: String!, $Limit: Int, $Offset: Int) {
      Get_User_Document_Analyses(User_Id: $User_Id, Limit: $Limit, Offset: $Offset) {
        Count
        Results {
          Analysis_Id
          File_Name
          Page_Count
          Extraction_Tool
          Status
          Created_At
          Classification { Level Confidence }
          Feedback { Overall_Score Grammar_Score Vocab_Score Punct_Score }
        }
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Limit, Offset } });
  return data.Get_User_Document_Analyses;
}

export async function getDocumentAnalysis({ Analysis_Id, User_Id }) {
  const query = `
    query GetUserDocumentAnalyses($User_Id: String!, $Limit: Int) {
      Get_User_Document_Analyses(User_Id: $User_Id, Limit: $Limit) {
        Results {
          Analysis_Id
          File_Name
          Page_Count
          Extraction_Tool
          Clean_Text
          Page_Results
          Status
          Error_Message
          Created_At
          Classification { Level Confidence Description Probabilities }
          Feedback { Corrected_Text Overall_Score Grammar_Score Vocab_Score Punct_Score Detected_Issues Errors Error_Trend Dominant_Error Severity Fluency Feedback_Text }
        }
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Limit: 100 } });
  const results = data.Get_User_Document_Analyses?.Results || [];
  return results.find(r => r.Analysis_Id === Analysis_Id) || null;
}

// ─── PLAN ─────────────────────────────────────────────────────────────────────

export async function generatePlan({
  User_Id, Mode, Save_To_Database = true,
  Exam_Id, Preferences,
  Is_Mode_Switch = false, From_Mode,
}) {
  const query = `
    mutation GeneratePlan(
      $User_Id: String!, $Mode: String!, $Save_To_Database: Boolean,
      $Exam_Id: String, $Preferences: String,
      $Is_Mode_Switch: Boolean, $From_Mode: String
    ) {
      Generate_Plan(
        User_Id: $User_Id, Mode: $Mode, Save_To_Database: $Save_To_Database,
        Exam_Id: $Exam_Id, Preferences: $Preferences,
        Is_Mode_Switch: $Is_Mode_Switch, From_Mode: $From_Mode
      ) {
        Success
        Status
        Error
        Plan { Data }
        Recommended_Resources
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Mode, Save_To_Database, Exam_Id, Preferences, Is_Mode_Switch, From_Mode },
  });
  const payload = data.Generate_Plan;
  return {
    ...payload,
    Plan: parseJsonField(payload?.Plan?.Data, null),
    Recommended_Resources: parseJsonField(payload?.Recommended_Resources, []),
  };
}

export async function generateNextPlan({ User_Id, Mode }) {
  const query = `
    mutation GenerateNextPlan($User_Id: String!, $Mode: String!) {
      Generate_Next_Plan(User_Id: $User_Id, Mode: $Mode) {
        Success
        Status
        Error
        Plan { Data }
        Recommended_Resources
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Mode },
  });
  const payload = data.Generate_Next_Plan;
  return {
    ...payload,
    Plan: parseJsonField(payload?.Plan?.Data, null),
    Recommended_Resources: parseJsonField(payload?.Recommended_Resources, []),
  };
}

export async function getActivePlan({ User_Id, Mode }) {
  const query = `
    query GetActivePlan($User_Id: String!, $Mode: String!) {
      Get_Active_Plan(User_Id: $User_Id, Mode: $Mode) {
        Id
        Mode
        Level
        Created_At
        Updated_At
        Is_Active
        Current_Period_Index
        Plan
        Source_Exam_Id
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Mode },
  });
  const raw = data?.Get_Active_Plan;
  if (!raw) return null;
  return {
    ...raw,
    Plan: parseJsonField(raw.Plan, null),
  };
}

export async function adjustPlan({
  User_Id,
  Instruction,
  Current_Plan,
  Selected_Period_Index = 0,
  Selected_Day_Index,
  Target_Day,
  Pinned_Task,
  Chat_Depth = 0,
}) {
  const query = `
    mutation AdjustPlan(
      $User_Id: String!,
      $Instruction: String!,
      $Current_Plan: String!,
      $Selected_Period_Index: Int,
      $Selected_Day_Index: Int,
      $Target_Day: String,
      $Pinned_Task: String,
      $Chat_Depth: Int
    ) {
      Adjust_Plan(
        User_Id: $User_Id,
        Instruction: $Instruction,
        Current_Plan: $Current_Plan,
        Selected_Period_Index: $Selected_Period_Index,
        Selected_Day_Index: $Selected_Day_Index,
        Target_Day: $Target_Day,
        Pinned_Task: $Pinned_Task,
        Chat_Depth: $Chat_Depth
      ) {
        Success
        Error
        Intent
        Chat_Message
        Diff_Summary
        Plan {
          Data
        }
      }
    }
  `;

  const currentPlanString = typeof Current_Plan === 'string'
    ? Current_Plan
    : JSON.stringify(Current_Plan);

  const pinnedTaskString = Pinned_Task
    ? (typeof Pinned_Task === 'string' ? Pinned_Task : JSON.stringify(Pinned_Task))
    : null;

  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: {
      User_Id,
      Instruction,
      Current_Plan: currentPlanString,
      Selected_Period_Index,
      Selected_Day_Index,
      Target_Day: Target_Day || null,
      Pinned_Task: pinnedTaskString,
      Chat_Depth,
    },
  });

  const payload = data?.Adjust_Plan;
  if (!payload) return { Success: false, Error: 'No response from server' };

  return {
    Success:     payload.Success,
    Error:       payload.Error,
    Intent:      payload.Intent      || 'general',
    ChatMessage: payload.Chat_Message || null,
    DiffSummary: payload.Diff_Summary || null,
    Plan:        payload.Plan?.Data ? parseJsonField(payload.Plan.Data, null) : null,
  };
}

export async function savePlan({ User_Id, Plan, Mode, Level }) {
  const query = `
    mutation SavePlan($User_Id: String!, $Plan: String!, $Mode: String!, $Level: String!) {
      Save_Plan(User_Id: $User_Id, Plan: $Plan, Mode: $Mode, Level: $Level) {
        Success
        Error
      }
    }
  `;
  
  const planString = typeof Plan === 'string' ? Plan : JSON.stringify(Plan);
  
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { 
      User_Id, 
      Plan: planString, 
      Mode, 
      Level 
    },
  });
  
  return data.Save_Plan;
}

export async function markPlanPeriodDone({ User_Id, Mode }) {
  const query = `
    mutation MarkPlanPeriodDone($User_Id: String!, $Mode: String!) {
      Mark_Plan_Period_Done(User_Id: $User_Id, Mode: $Mode) {
        Success
        Status
        Error
        Plan { Data }
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Mode },
  });
  const payload = data.Mark_Plan_Period_Done;
  return {
    ...payload,
    Plan: parseJsonField(payload?.Plan?.Data, null),
  };
}

export async function getPlanHistory({ User_Id, Limit = 5 }) {
  const query = `
    query PlanHistory($User_Id: String!, $Limit: Int) {
      Get_Plan_History(User_Id: $User_Id, Limit: $Limit) {
        Id
        Mode
        Level
        Created_At
        Plan
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Limit },
  });

  return (data.Get_Plan_History || []).map((item) => ({
    ...item,
    Plan: parseJsonField(item.Plan, null),
  }));
}

// ─── TASK DETAILS ────────────────────────────────────────────────────────────

export async function startTask({ User_Id, Plan_Id, Task_Id }) {
  const query = `
    mutation StartTask($User_Id: String!, $Plan_Id: String!, $Task_Id: String!) {
      Start_Task(User_Id: $User_Id, Plan_Id: $Plan_Id, Task_Id: $Task_Id) {
        Success
        Error
        Task {
          Task_Id
          Status
          Started_At
        }
      }
    }
  `;
  
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Plan_Id, Task_Id },
  });
  
  return data?.Start_Task || { Success: false, Error: 'No response' };
}

export async function submitTaskText({ User_Id, Plan_Id, Task_Id, Input_Text }) {
  const query = `
    mutation SubmitTaskText(
      $User_Id: String!,
      $Plan_Id: String!,
      $Task_Id: String!,
      $Input_Text: String!
    ) {
      Submit_Task_Text(
        User_Id: $User_Id,
        Plan_Id: $Plan_Id,
        Task_Id: $Task_Id,
        Input_Text: $Input_Text
      ) {
        Success
        AI_Detected
        AI_Confidence
        Recommended_Resources
        Error
        Task {
          Task_Id
          Status
          Input_Text
          Corrected_Text
          Detected_Issues
          Scores
          Feedback_Errors
          Feedback_Error_Trend
          Feedback_Dominant_Error
          Level
          Classified_Level
          Classified_Confidence
          Submitted_At
          Is_Auto_Submitted
        }
      }
    }
  `;
  
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Plan_Id, Task_Id, Input_Text },
  });
  
  const payload = data?.Submit_Task_Text;
  if (!payload) return { Success: false, Error: 'No response from server' };
  
  return {
    Success: payload.Success,
    AI_Detected: payload.AI_Detected ?? false,
    AI_Confidence: payload.AI_Confidence ?? 0,
    Recommended_Resources: parseJsonField(payload.Recommended_Resources, []),
    Error: payload.Error,
    Task: payload.Task
      ? {
          ...payload.Task,
          Detected_Issues: parseJsonField(payload.Task.Detected_Issues, []),
          Scores: parseJsonField(payload.Task.Scores, {}),
          Feedback_Errors: parseJsonField(payload.Task.Feedback_Errors, []),
        }
      : null,
  };
}

export async function resetTask({ User_Id, Plan_Id, Task_Id }) {
  const query = `
    mutation ResetTask($User_Id: String!, $Plan_Id: String!, $Task_Id: String!) {
      Reset_Task(User_Id: $User_Id, Plan_Id: $Plan_Id, Task_Id: $Task_Id) {
        Success
        Error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Plan_Id, Task_Id } });
  return data?.Reset_Task || { Success: false, Error: 'No response' };
}

export async function cancelTask({ User_Id, Plan_Id, Task_Id }) {
  const query = `
    mutation CancelTask($User_Id: String!, $Plan_Id: String!, $Task_Id: String!) {
      Cancel_Task(User_Id: $User_Id, Plan_Id: $Plan_Id, Task_Id: $Task_Id) {
        Success
        Error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Plan_Id, Task_Id } });
  return data?.Cancel_Task || { Success: false, Error: 'No response' };
}

export async function getTaskHistory({ User_Id, Plan_Id, Limit = 100 }) {
  const query = `
    query GetTaskHistory($User_Id: String!, $Plan_Id: String!, $Limit: Int) {
      Get_Task_History(User_Id: $User_Id, Plan_Id: $Plan_Id, Limit: $Limit) {
        Task_Id
        Status
        Input_Text
        Corrected_Text
        Detected_Issues
        Scores
        Feedback_Errors
        Feedback_Error_Trend
        Feedback_Dominant_Error
        Level
        Classified_Level
        Classified_Confidence
        Started_At
        Submitted_At
        Is_Auto_Submitted
        Material_Quality
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Plan_Id, Limit },
  });
  return (data.Get_Task_History || []).map((t) => ({
    ...t,
    Detected_Issues: parseJsonField(t.Detected_Issues, []),
    Scores: parseJsonField(t.Scores, {}),
    Feedback_Errors: parseJsonField(t.Feedback_Errors, []),
  }));
}

export async function getUserStreak({ User_Id }) {
  const query = `
    query GetUserStreak($User_Id: String!) {
      Get_User_Streak(User_Id: $User_Id) {
        Current_Streak
        Longest_Streak
        Last_Active_Date
        Total_Days_Active
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id },
  });
  return data.Get_User_Streak || null;
}

export async function getPlanSummary({ User_Id, Mode }) {
  const query = `
    query GetPlanSummary($User_Id: String!, $Mode: String!) {
      Get_Plan_Summary(User_Id: $User_Id, Mode: $Mode) {
        Has_Active_Plan
        Level
        Mode
        Progress_Pct
        Completed_Tasks
        Total_Tasks
        Focus_Skills
        Today_Tasks {
          Task_Id
          Title
          Type
          Estimated_Minutes
          Status
        }
        Current_Streak
        Ends_At
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Mode },
  });
  return data.Get_Plan_Summary || null;
}

export async function fetchTaskExamples({ Task_Type, Skill, Level, Limit = 3 }) {
  const query = `
    mutation FetchTaskExamples($Task_Type: String!, $Skill: String!, $Level: String!, $Limit: Int) {
      Fetch_Task_Examples(Task_Type: $Task_Type, Skill: $Skill, Level: $Level, Limit: $Limit) {
        Success
        Examples {
          Type
          Wrong
          Correct
          Explanation
          Content
          Source
          Url
        }
        Error
      }
    }
  `;
  
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { Task_Type, Skill, Level, Limit },
  });
  
  return data?.Fetch_Task_Examples;
}

export async function generateTaskLearnFields({ Example_Error, Example_Correction, Skills = [], Level = 'B1' }) {
  const query = `
    mutation GenerateTaskLearnFields(
      $Example_Error: String!,
      $Example_Correction: String!,
      $Skills: [String],
      $Level: String
    ) {
      Generate_Task_Learn_Fields(
        Example_Error: $Example_Error,
        Example_Correction: $Example_Correction,
        Skills: $Skills,
        Level: $Level
      ) {
        Success
        Explanation
        Correction_Reason
        Error
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL, query,
    variables: { Example_Error, Example_Correction, Skills, Level },
  });
  return data?.Generate_Task_Learn_Fields;
}

export async function trackResourceClick({ User_Id, Resource_Url }) {
  const query = `
    mutation TrackResourceClick($User_Id: String!, $Resource_Url: String!) {
      Track_Resource_Click(User_Id: $User_Id, Resource_Url: $Resource_Url) {
        Success
      }
    }
  `;
  try {
    const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id, Resource_Url } });
    return data?.Track_Resource_Click?.Success ?? false;
  } catch {
    return false;
  }
}

export async function getRecommendations({ Issues, Cefr_Level, User_Id, Limit = 3 }) {
  const query = `
    query GetRecommendations($Issues: [String]!, $Cefr_Level: String!, $User_Id: String, $Limit: Int) {
      Get_Recommendations(Issues: $Issues, Cefr_Level: $Cefr_Level, User_Id: $User_Id, Limit: $Limit) {
        Success
        Categories
        Resources {
          Id Title Url Description Type Source Categories Cefr_Levels
        }
        Error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { Issues, Cefr_Level, User_Id, Limit } });
  return data?.Get_Recommendations;
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

export async function getChatSessions({ User_Id }) {
  const query = `
    query GetChatSessions($User_Id: String!) {
      Get_Chat_Sessions(User_Id: $User_Id) {
        session_id title pdf_url pdf_filename message_count created_at updated_at
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id } });
  return data?.Get_Chat_Sessions ?? [];
}

export async function getChatMessages({ Session_Id, User_Id }) {
  const query = `
    query GetChatMessages($Session_Id: String!, $User_Id: String!) {
      Get_Chat_Messages(Session_Id: $Session_Id, User_Id: $User_Id) {
        message_id session_id role content intent rating rating_comment timestamp
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { Session_Id, User_Id } });
  return data?.Get_Chat_Messages ?? [];
}

export async function createChatSession({ User_Id }) {
  const query = `
    mutation CreateChatSession($User_Id: String!) {
      Create_Chat_Session(User_Id: $User_Id) {
        session_id error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { User_Id } });
  return data?.Create_Chat_Session;
}

export async function sendChatMessage({ Session_Id, User_Id, Message, User_Level = 'B1', Pdf_Base64, Pdf_Filename }) {
  const query = `
    mutation SendChatMessage(
      $Session_Id: String!, $User_Id: String!, $Message: String!,
      $User_Level: String, $Pdf_Base64: String, $Pdf_Filename: String
    ) {
      Send_Chat_Message(
        Session_Id: $Session_Id, User_Id: $User_Id, Message: $Message,
        User_Level: $User_Level, Pdf_Base64: $Pdf_Base64, Pdf_Filename: $Pdf_Filename
      ) {
        message_id reply intent title
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL, query,
    variables: { Session_Id, User_Id, Message, User_Level, Pdf_Base64, Pdf_Filename },
  });
  return data?.Send_Chat_Message;
}

export async function rateChatMessage({ Message_Id, User_Id, Rating, Rating_Comment = '' }) {
  const query = `
    mutation RateChatMessage($Message_Id: String!, $User_Id: String!, $Rating: String!, $Rating_Comment: String) {
      Rate_Chat_Message(Message_Id: $Message_Id, User_Id: $User_Id, Rating: $Rating, Rating_Comment: $Rating_Comment) {
        success error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { Message_Id, User_Id, Rating, Rating_Comment } });
  return data?.Rate_Chat_Message;
}

export async function deleteChatSession({ Session_Id, User_Id }) {
  const query = `
    mutation DeleteChatSession($Session_Id: String!, $User_Id: String!) {
      Delete_Chat_Session(Session_Id: $Session_Id, User_Id: $User_Id) {
        success error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { Session_Id, User_Id } });
  return data?.Delete_Chat_Session;
}

export async function renameChatSession({ Session_Id, User_Id, New_Title }) {
  const query = `
    mutation RenameChatSession($Session_Id: String!, $User_Id: String!, $New_Title: String!) {
      Rename_Chat_Session(Session_Id: $Session_Id, User_Id: $User_Id, New_Title: $New_Title) {
        success error
      }
    }
  `;
  const data = await graphQLRequest({ url: AI_URL, query, variables: { Session_Id, User_Id, New_Title } });
  return data?.Rename_Chat_Session;
}

