# User Backend API Testing Examples

## GraphQL Endpoint
```
http://localhost:4000/graphql
```

## Headers (for all requests)
```json
{
  "Content-Type": "application/json"
}
```

---

## 1. Sign Up (Create New User)

### GraphQL Mutation
```graphql
mutation SignUp {
  signUp(
    User_Name: "john_doe"
    Email: "john.doe@example.com"
    Password: "SecurePassword123!"
  ) {
    id
    User_Name
    Email
    Created_At
    token
  }
}
```

### HTTP POST Request Body
```json
{
  "query": "mutation SignUp($userName: String!, $email: String!, $password: String!) { signUp(User_Name: $userName, Email: $email, Password: $password) { id User_Name Email Created_At token } }",
  "variables": {
    "userName": "john_doe",
    "email": "john.doe@example.com",
    "password": "SecurePassword123!"
  }
}
```

### Expected Response
```json
{
  "data": {
    "signUp": {
      "id": "507f1f77bcf86cd799439011",
      "User_Name": "john_doe",
      "Email": "john.doe@example.com",
      "Created_At": "2026-03-03T10:30:00.000Z",
      "token": null
    }
  }
}
```

---

## 2. Login (Authenticate User)

### GraphQL Mutation
```graphql
mutation Login {
  login(
    Email: "john.doe@example.com"
    Password: "SecurePassword123!"
  ) {
    id
    User_Name
    Email
    Created_At
    token
  }
}
```

### HTTP POST Request Body
```json
{
  "query": "mutation Login($email: String!, $password: String!) { login(Email: $email, Password: $password) { id User_Name Email Created_At token } }",
  "variables": {
    "email": "john.doe@example.com",
    "password": "SecurePassword123!"
  }
}
```

### Expected Response
```json
{
  "data": {
    "login": {
      "id": "507f1f77bcf86cd799439011",
      "User_Name": "john_doe",
      "Email": "john.doe@example.com",
      "Created_At": "2026-03-03T10:30:00.000Z",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

---

## 3. Get All Users

### GraphQL Query
```graphql
query GetAllUsers {
  users {
    id
    User_Name
    Email
    Created_At
  }
}
```

### HTTP POST Request Body
```json
{
  "query": "query GetAllUsers { users { id User_Name Email Created_At } }"
}
```

---

## 4. Get Single User by ID

### GraphQL Query
```graphql
query GetUser {
  user(id: "507f1f77bcf86cd799439011") {
    id
    User_Name
    Email
    Created_At
  }
}
```

### HTTP POST Request Body
```json
{
  "query": "query GetUser($id: ID!) { user(id: $id) { id User_Name Email Created_At } }",
  "variables": {
    "id": "507f1f77bcf86cd799439011"
  }
}
```

---

## Error Scenarios

### 1. Sign Up - Email Already Exists
**Request:**
```graphql
mutation SignUp {
  signUp(
    User_Name: "new_user"
    Email: "existing@example.com"
    Password: "Password123!"
  ) {
    id
    User_Name
    Email
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "User with this Email already exists"
    }
  ]
}
```

### 2. Sign Up - Username Already Taken
**Request:**
```graphql
mutation SignUp {
  signUp(
    User_Name: "existing_user"
    Email: "newemail@example.com"
    Password: "Password123!"
  ) {
    id
    User_Name
    Email
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Username already taken. Please choose a different username."
    }
  ]
}
```

### 3. Login - User Not Found
**Request:**
```graphql
mutation Login {
  login(
    Email: "nonexistent@example.com"
    Password: "Password123!"
  ) {
    id
    token
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "User not found"
    }
  ]
}
```

### 4. Login - Invalid Password
**Request:**
```graphql
mutation Login {
  login(
    Email: "john.doe@example.com"
    Password: "WrongPassword"
  ) {
    id
    token
  }
}
```

**Response:**
```json
{
  "errors": [
    {
      "message": "Invalid Password"
    }
  ]
}
```

---

## Testing with cURL

### Sign Up
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { signUp(User_Name: \"test_user\", Email: \"test@example.com\", Password: \"Test123!\") { id User_Name Email token } }"
  }'
```

### Login
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { login(Email: \"test@example.com\", Password: \"Test123!\") { id User_Name Email token } }"
  }'
```

---

## Testing with Postman

1. Create a new POST request to `http://localhost:4000/graphql`
2. Set Headers: `Content-Type: application/json`
3. In Body, select "GraphQL" or "raw JSON"
4. Paste the GraphQL mutation/query or the JSON request body
5. Click "Send"

---

## Testing with Apollo Studio Sandbox

1. Navigate to `http://localhost:4000/graphql` in your browser
2. Apollo Studio Sandbox should open automatically
3. Paste the GraphQL mutations/queries directly
4. Click "Run" to execute

---

## Notes

- The server must be running on port 4000 (or the port specified in your `.env` file)
- Passwords are hashed using bcrypt before storing
- JWT tokens expire after 1 hour
- Make sure MongoDB is connected and running
- The `token` field is only returned on successful login
