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
          Feedback_Corrected_Text
          Feedback_Detected_Issues
          Answer_Text
        }
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
          Raw_Text
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

// ─── PLAN ─────────────────────────────────────────────────────────────────────

export async function generatePlan({ User_Id, Mode, Level, Save_To_Database = true }) {
  const query = `
    mutation GeneratePlan($User_Id: String!, $Mode: String!, $Level: String, $Save_To_Database: Boolean) {
      Generate_Plan(User_Id: $User_Id, Mode: $Mode, Level: $Level, Save_To_Database: $Save_To_Database) {
        Success
        Error
        Plan { Data }
      }
    }
  `;
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: { User_Id, Mode, Level, Save_To_Database },
  });
  const payload = data.Generate_Plan;
  return {
    ...payload,
    Plan: parseJsonField(payload?.Plan?.Data, null),
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

export async function adjustPlan({ User_Id, Instruction, Current_Plan, Selected_Period_Index = 0, Selected_Day_Index }) {
  const query = `
    mutation AdjustPlan(
      $User_Id: String!,
      $Instruction: String!,
      $Current_Plan: String!,
      $Selected_Period_Index: Int,
      $Selected_Day_Index: Int
    ) {
      Adjust_Plan(
        User_Id: $User_Id,
        Instruction: $Instruction,
        Current_Plan: $Current_Plan,
        Selected_Period_Index: $Selected_Period_Index,
        Selected_Day_Index: $Selected_Day_Index
      ) {
        Success
        Error
        Plan {
          Data
        }
      }
    }
  `;
  
  const currentPlanString = typeof Current_Plan === 'string' 
    ? Current_Plan 
    : JSON.stringify(Current_Plan);
  
  const data = await graphQLRequest({
    url: AI_URL,
    query,
    variables: {
      User_Id,
      Instruction,
      Current_Plan: currentPlanString,
      Selected_Period_Index,
      Selected_Day_Index,
    },
  });
  
  const payload = data?.Adjust_Plan;
  if (!payload) return { Success: false, Error: 'No response from server' };
  
  return {
    Success: payload.Success,
    Error: payload.Error,
    Plan: payload.Plan?.Data ? parseJsonField(payload.Plan.Data, null) : null,
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
        Error
        Task {
          Task_Id
          Status
          Input_Text
          Corrected_Text
          Detected_Issues
          Scores
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
    Error: payload.Error,
    Task: payload.Task
      ? {
          ...payload.Task,
          Detected_Issues: parseJsonField(payload.Task.Detected_Issues, []),
          Scores: parseJsonField(payload.Task.Scores, {}),
        }
      : null,
  };
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

export async function getPlanSummary({ User_Id, Mode = 'weekly' }) {
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