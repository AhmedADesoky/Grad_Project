# AI_Backend and User_Backend Server Startup Guide

## Quick Start Commands

### Start AI_Backend (Django) - Port 8000

**Option 1: Using PowerShell**
```powershell
cd Backend/AI_Backend
& "c:\Users\Ahmed Abdel Samad\Documents\GitHub\Grad_Project\.venv\Scripts\python.exe" manage.py runserver 8000
```

**Option 2: Using batch file** (from project root)
```cmd
start_ai_backend.bat
```

**Option 3: Direct command** (from AI_Backend directory)
```powershell
cd Backend/AI_Backend
.\venv\Scripts\Activate.ps1
python manage.py runserver 8000
```

### Start User_Backend (Node.js) - Port 4000

**Option 1: Using PowerShell**
```powershell
cd Backend/User_Backend
npm run dev
```

**Option 2: Using batch file** (from project root)
```cmd
start_user_backend.bat
```

## GraphQL Endpoints

### AI_Backend GraphQL
- **URL**: http://localhost:8000/graphql/
- **GraphiQL Interface**: http://localhost:8000/graphql/
  - Built-in GraphQL playground for testing
  - Auto-completion and documentation

### User_Backend GraphQL
- **URL**: http://localhost:4000/graphql
- **Apollo Server Playground**: http://localhost:4000/graphql

## Testing GraphQL APIs

### Test AI_Backend Classification

**1. Open GraphiQL**: http://localhost:8000/graphql/

**2. Classify Text and Save to Database**:
```graphql
mutation {
  ClassifyText(
    Text: "The economic implications of climate change require immediate attention"
    UserId: "user_123"
    SaveToDatabase: true
    IncludeProbabilities: true
  ) {
    Success
    Result {
      Level
      Confidence
      Description
    }
    SavedClassification {
      Id
      Level
      CreatedAt
    }
  }
}
```

**3. Get User Classifications**:
```graphql
query {
  GetUserClassifications(UserId: "user_123", Limit: 10) {
    Id
    Text
    Level
    Confidence
    CreatedAt
  }
}
```

**4. Get Model Info**:
```graphql
query {
  ModelInfo {
    ModelPath
    Device
    Levels
    ModelLoaded
  }
}
```

### Test User_Backend

**1. Open Apollo Playground**: http://localhost:4000/graphql

**2. Sign Up**:
```graphql
mutation {
  signUp(
    User_Name: "testuser"
    Email: "test@example.com"
    Password: "password123"
  ) {
    id
    User_Name
    Email
    token
  }
}
```

**3. Login**:
```graphql
mutation {
  login(
    Email: "test@example.com"
    Password: "password123"
  ) {
    id
    User_Name
    token
  }
}
```

**4. Get User with Classifications**:
```graphql
query {
  user(id: "USER_ID_HERE") {
    User_Name
    Email
    classifications {
      Id
      Level
      Confidence
      CreatedAt
    }
  }
}
```

**5. Save Classification**:
```graphql
mutation {
  Save_Classification(
    User_Id: "USER_ID_HERE"
    Text: "Sample text"
    Level: "B2"
    Confidence: 85.5
    Description: "Upper Intermediate"
    Text_Length: 50
    Word_Count: 10
  ) {
    id
    Level
    Confidence
  }
}
```

## Running Test Scripts

### Test AI_Backend GraphQL
```powershell
cd Backend/AI_Backend
.\venv\Scripts\Activate.ps1
python Classification\test_graphql_database.py
```

### Test MongoDB Connection
```powershell
cd Backend/AI_Backend
.\venv\Scripts\Activate.ps1
python test_mongodb.py
```

## Troubleshooting

### Common Issues

**1. "pythn is not recognized"**
- Typo: Use `python` not `pythn`
- Correct command: `python manage.py runserver`

**2. Port already in use**
```powershell
# Kill process on port 8000
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force

# Kill process on port 4000
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
```

**3. Module not found errors**
```powershell
# AI_Backend - install dependencies
cd Backend/AI_Backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# User_Backend - install dependencies
cd Backend/User_Backend
npm install
```

**4. MongoDB not running**
```powershell
# Check if MongoDB is running
Get-Service MongoDB

# Start MongoDB service
net start MongoDB
```

## Full Workflow Example

### 1. Start Both Servers

**Terminal 1 - AI_Backend**:
```powershell
cd "c:\Users\Ahmed Abdel Samad\Documents\GitHub\Grad_Project\Backend\AI_Backend"
.\venv\Scripts\Activate.ps1
python manage.py runserver 8000
```

**Terminal 2 - User_Backend**:
```powershell
cd "c:\Users\Ahmed Abdel Samad\Documents\GitHub\Grad_Project\Backend\User_Backend"
npm run dev
```

### 2. Test End-to-End Flow

**Step 1**: Create user (User_Backend - http://localhost:4000/graphql)
```graphql
mutation {
  signUp(
    User_Name: "john_doe"
    Email: "john@example.com"
    Password: "secure123"
  ) {
    id
    User_Name
    token
  }
}
```

**Step 2**: Classify text and save (AI_Backend - http://localhost:8000/graphql/)
```graphql
mutation {
  ClassifyText(
    Text: "The intricate mechanisms underlying quantum entanglement phenomena..."
    UserId: "USER_ID_FROM_STEP_1"
    SaveToDatabase: true
  ) {
    Success
    Result {
      Level
      Confidence
    }
    SavedClassification {
      Id
    }
  }
}
```

**Step 3**: View user's classifications (User_Backend)
```graphql
query {
  user(id: "USER_ID_FROM_STEP_1") {
    User_Name
    classifications {
      Level
      Confidence
      Text
    }
  }
}
```

## Server URLs Summary

| Service | URL | Port |
|---------|-----|------|
| AI_Backend GraphQL | http://localhost:8000/graphql/ | 8000 |
| User_Backend GraphQL | http://localhost:4000/graphql | 4000 |
| Frontend | http://localhost:5174 | 5174 |

## Environment Variables Required

**AI_Backend (.env)**:
```env
MONGO_URL=mongodb://localhost:27017/
DB_NAME=EWC
DEBUG=True
SECRET_KEY=your-secret-key
```

**User_Backend (.env)**:
```env
PORT=4000
MONGO_URL="mongodb://localhost:27017/EWC"
JWT_SECRET="your-secret-key"
```
