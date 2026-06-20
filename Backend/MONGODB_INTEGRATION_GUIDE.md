# MongoDB Integration Guide

## Overview

Both AI_Backend and User_Backend are now connected to the same MongoDB database (`EWC`) for storing classification results linked to user accounts.

## Architecture

### Database Configuration

- **Database Name**: `EWC`
- **Connection URL**: `mongodb://localhost:27017/`
- **Shared Collections**:
  - `users` - User authentication data (User_Backend)
  - `token_blacklists` - JWT token blacklist (User_Backend)
  - `classification_levels` - Classification results (Both backends)

### AI_Backend (Django)

**Database Engine**: djongo (MongoDB connector for Django)

**Configuration** (AI_Backend/settings.py):
```python
DATABASES = {
    'default': {
        'ENGINE': 'djongo',
        'NAME': 'EWC',
        'CLIENT': {
            'host': 'mongodb://localhost:27017/',
        }
    }
}
```

**Model** (Classification/models.py):
```python
class Classification_Level(models.Model):
    _id = models.ObjectIdField()
    User_Id = models.CharField(max_length=100, db_index=True)
    Text = models.TextField()
    Level = models.CharField(max_length=2)
    Confidence = models.FloatField()
    Description = models.TextField()
    Text_Length = models.IntegerField()
    Word_Count = models.IntegerField()
    Probabilities = models.JSONField(null=True, blank=True)
    Created_At = models.DateTimeField(default=timezone.now, db_index=True)
```

### User_Backend (Node.js/Mongoose)

**Database Engine**: Mongoose

**Model** (models/ClassificationLevel.js):
```javascript
const Classification_Level_Schema = new mongoose.Schema({
  User_Id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  Text: { type: String, required: true },
  Level: { type: String, required: true, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  Confidence: { type: Number, required: true },
  Description: { type: String, required: true },
  Text_Length: { type: Number, required: true },
  Word_Count: { type: Number, required: true },
  Probabilities: { type: Map, of: Number }
}, { timestamps: true });
```

## GraphQL API

### AI_Backend GraphQL Operations

**Endpoint**: `http://localhost:8000/classification/graphql/`

#### New Mutations

##### 1. Classify Text and Save
```graphql
mutation {
  Classify_Text(
    Text: "The economic implications of climate change require immediate attention"
    Include_Probabilities: true
    User_Id: "user_123"
    Save_To_Database: true
  ) {
    Success
    Result {
      Level
      Confidence
      Description
      Text_Length
      Word_Count
      Probabilities {
        A1 A2 B1 B2 C1 C2
      }
    }
    Saved_Classification {
      _id
      User_Id
      Level
      Confidence
      Created_At
    }
    Error
  }
}
```

#### New Queries

##### 1. Get User Classifications (Paginated)
```graphql
query {
  Get_User_Classifications(
    User_Id: "user_123"
    Limit: 10
    Offset: 0
  ) {
    _id
    Text
    Level
    Confidence
    Description
    Created_At
  }
}
```

##### 2. Get Classifications by Level
```graphql
query {
  Get_Classification_By_Level(
    User_Id: "user_123"
    Level: "B2"
  ) {
    _id
    Text
    Level
    Confidence
    Created_At
  }
}
```

##### 3. Get Recent Classifications
```graphql
query {
  Get_Recent_Classifications(
    User_Id: "user_123"
    Days: 7
  ) {
    _id
    Text
    Level
    Confidence
    Created_At
  }
}
```

### User_Backend GraphQL Operations

**Endpoint**: `http://localhost:4000/graphql`

#### Mutations

##### Save Classification
```graphql
mutation {
  Save_Classification(
    User_Id: "user_id_here"
    Text: "Sample text"
    Level: "B2"
    Confidence: 79.43
    Description: "Upper Intermediate"
    Text_Length: 50
    Word_Count: 10
    Probabilities: {
      A1: 2.1, A2: 5.3, B1: 8.7, B2: 79.4, C1: 3.2, C2: 1.3
    }
  ) {
    id
    User_Id
    Level
    Confidence
    Created_At
  }
}
```

#### Queries

##### Get User Classifications
```graphql
query {
  Get_User_Classifications(
    User_Id: "user_id_here"
    Limit: 10
    Offset: 0
  ) {
    id
    Text
    Level
    Confidence
    Created_At
  }
}
```

##### Get Classification By Level
```graphql
query {
  Get_Classification_By_Level(
    User_Id: "user_id_here"
    Level: "B2"
  ) {
    id
    Text
    Level
    Confidence
  }
}
```

##### Get Recent Classifications
```graphql
query {
  Get_Recent_Classifications(
    User_Id: "user_id_here"
    Days: 7
  ) {
    id
    Level
    Confidence
    Created_At
  }
}
```

##### Get User with Classifications
```graphql
query {
  user(id: "user_id_here") {
    id
    User_Name
    Email
    classifications {
      id
      Level
      Confidence
      Created_At
    }
  }
}
```

## Usage Flow

### 1. User Signup/Login (User_Backend)
```graphql
mutation {
  login(Email: "user@example.com", Password: "password") {
    id
    User_Name
    Email
    token
  }
}
```

### 2. Classify Text and Save (AI_Backend)
Use the user ID from login to save classification:
```graphql
mutation {
  Classify_Text(
    Text: "Your text here"
    User_Id: "user_id_from_login"
    Save_To_Database: true
  ) {
    Success
    Result {
      Level
      Confidence
    }
    Saved_Classification {
      _id
    }
  }
}
```

### 3. View Classification History (Either Backend)

From AI_Backend:
```graphql
query {
  Get_User_Classifications(User_Id: "user_id") {
    Level
    Confidence
    Created_At
  }
}
```

From User_Backend:
```graphql
query {
  Get_User_Classifications(User_Id: "user_id") {
    Level
    Confidence
    Created_At
  }
}
```

## Testing

### Test MongoDB Connection
```bash
cd Backend/AI_Backend
python test_mongodb.py
```

### Test GraphQL API
```bash
cd Backend/AI_Backend
python Classification/test_graphql.py
```

## Environment Variables

### AI_Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017/
DB_NAME=EWC
DEBUG=True
SECRET_KEY=your-secret-key
```

### User_Backend (.env)
```env
PORT=4000
MONGO_URL="mongodb://localhost:27017/EWC"
JWT_SECRET="your-secret-key"
```

## Database Collections

### classification_levels
```javascript
{
  _id: ObjectId,
  User_Id: String (References users._id),
  Text: String,
  Level: String (A1|A2|B1|B2|C1|C2),
  Confidence: Number,
  Description: String,
  Text_Length: Number,
  Word_Count: Number,
  Probabilities: Object,
  Created_At: DateTime,
  Updated_At: DateTime
}
```

## Dependencies

### AI_Backend
```
Django==4.1.13
djongo==1.3.6
pymongo==3.12.3
sqlparse==0.2.4
pytz==2026.1
django-cors-headers==3.14.0
graphene-django==3.2.2
python-dotenv==1.0.1
transformers==4.47.1
torch==2.5.1
```

### User_Backend
```
mongoose==8.x
```

## Common Operations

### View All Classifications in MongoDB
```javascript
// In MongoDB shell
use EWC
db.classification_levels.find().pretty()
```

### Filter by User
```javascript
db.classification_levels.find({ User_Id: "user_123" }).sort({ Created_At: -1 })
```

### Count Classifications by Level
```javascript
db.classification_levels.aggregate([
  { $group: { _id: "$Level", count: { $sum: 1 } } }
])
```

## Troubleshooting

### MongoDB Connection Failed
1. Ensure MongoDB is running: `mongod --version`
2. Check connection string in .env files
3. Verify database name is "EWC"

### djongo Import Error
```bash
pip install djongo==1.3.6 pymongo==3.12.3 pytz
```

### GraphQL Schema Errors
1. Restart Django server after schema changes
2. Clear __pycache__ directories
3. Check GraphQL syntax in GraphiQL interface

## Future Enhancements

1. **Analytics Queries**: Add aggregation queries for user progress tracking
2. **Level Progression**: Track user improvement over time
3. **Batch Operations**: Save multiple classifications at once
4. **Export Data**: Export user classification history to CSV/PDF
5. **Real-time Updates**: WebSocket subscriptions for live classification updates
