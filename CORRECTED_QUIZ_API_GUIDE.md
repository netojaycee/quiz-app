# 🚨 UPDATED QUIZ TESTING GUIDE - CORRECT API STRUCTURE

## ✅ **CORRECTED API STRUCTURE**

The actual quiz creation API is different from what I initially documented. Here's the correct structure:

## Phase 1: Setup Users and Authentication

### Step 1: Create Required Accounts

**A. Create Moderator**

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "moderator",
  "email": "moderator@test.com",
  "password": "password123",
  "role": "MODERATOR"
}
```

**B. Create Audience**

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "audience1",
  "email": "audience1@test.com",
  "password": "password123",
  "role": "AUDIENCE"
}
```

### Step 2: Login Required Users

**Login Moderator:**

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "moderator@test.com",
  "password": "password123"
}
```

Save the `access_token` as `MODERATOR_TOKEN`

## Phase 2: Quiz Creation (Correct API)

### Step 3: Create Quiz with Auto-Generated Users

**API Endpoint:** `POST http://localhost:3000/quiz` (NOT `/quiz/create`)

```http
POST http://localhost:3000/quiz
Authorization: Bearer {{MODERATOR_TOKEN}}
Content-Type: application/json

{
  "name": "Complete Quiz Test - 3 Rounds",
  "rounds": [
    {
      "roundNumber": 1,
      "quizType": "yes_no",
      "timePerQuestion": 20,
      "questionsPerParticipant": 2
    },
    {
      "roundNumber": 2,
      "quizType": "multiple_choice",
      "timePerQuestion": 30,
      "questionsPerParticipant": 2
    },
    {
      "roundNumber": 3,
      "quizType": "simultaneous",
      "timePerQuestion": 40,
      "questionsPerParticipant": 3
    }
  ],
  "users": [
    {
      "username": "team_lagos",
      "contestants": [
        {
          "name": "Alice",
          "location": "Lagos"
        },
        {
          "name": "Bob",
          "location": "Lagos"
        }
      ]
    },
    {
      "username": "team_abuja",
      "contestants": [
        {
          "name": "Charlie",
          "location": "Abuja"
        },
        {
          "name": "Diana",
          "location": "Abuja"
        }
      ]
    }
  ]
}
```

### Step 4: What This API Does

This single API call will:

1. ✅ Create a quiz with 3 rounds
2. ✅ Create 2 user accounts: `team_lagos` and `team_abuja` (role: CONTESTANT)
3. ✅ Create 4 contestants linked to these users
4. ✅ Return complete quiz data with all IDs

**Save the returned `quiz.id` as `QUIZ_ID`**

## Phase 3: Handle Authentication for Created Users

### ⚠️ **IMPORTANT AUTHENTICATION ISSUE**

The auto-created users (`team_lagos`, `team_abuja`) are created **WITHOUT passwords**, so they cannot login using the normal login API.

### Solution Options:

**Option A: Update User Passwords (Recommended)**

```http
PATCH http://localhost:3000/users/{{USER_ID}}
Authorization: Bearer {{MODERATOR_TOKEN}}
Content-Type: application/json

{
  "password": "contestant123"
}
```

**Option B: Create Manual Contestant Accounts**
Instead of using auto-generated users, create them manually:

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "team_lagos",
  "email": "team_lagos@test.com",
  "password": "contestant123",
  "role": "CONTESTANT"
}
```

Then use `existingUserIds` in the quiz creation payload.

## Phase 4: Upload Questions

```http
POST http://localhost:3000/questions/{{QUIZ_ID}}/upload
Authorization: Bearer {{MODERATOR_TOKEN}}
Content-Type: multipart/form-data

file: [Upload the CSV file]
```

## Phase 5: WebSocket Testing

### Connection Setup:

- **URL**: `ws://localhost:3000`
- **Headers**: `Authorization: Bearer {{TOKEN}}`

### Join Quiz Room:

```json
{
  "event": "joinQuiz",
  "data": {
    "quizId": "{{QUIZ_ID}}"
  }
}
```

## Phase 6: Round Testing

### Start Round:

```json
{
  "event": "startRound",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND_ID}}"
  }
}
```

### Answer Flow (Sequential):

```json
// 1. Select answer
{
  "event": "selectAnswer",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND_ID}}",
    "questionId": "{{QUESTION_ID}}",
    "selectedIndex": 0
  }
}

// 2. Confirm answer (moderator)
{
  "event": "confirmAnswer",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND_ID}}",
    "questionId": "{{QUESTION_ID}}"
  }
}
```

### Answer Flow (Simultaneous):

```json
{
  "event": "submitSimultaneousAnswer",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND_ID}}",
    "questionId": "{{QUESTION_ID}}",
    "selectedIndex": 1,
    "questionNumber": 1
  }
}
```

## ✅ **CORRECTED PAYLOAD STRUCTURE**

Your original payload structure was **EXACTLY CORRECT**:

```json
{
  "name": "Bible Knowledge Championship 2025",
  "rounds": [
    {
      "roundNumber": 1,
      "quizType": "multiple_choice",
      "timePerQuestion": 30,
      "questionsPerParticipant": 2
    },
    {
      "roundNumber": 2,
      "quizType": "yes_no",
      "timePerQuestion": 15,
      "questionsPerParticipant": 2
    },
    {
      "roundNumber": 3,
      "quizType": "simultaneous",
      "timePerQuestion": 45,
      "questionsPerParticipant": 3
    }
  ],
  "users": [
    {
      "username": "lagos",
      "contestants": [
        {
          "name": "John",
          "location": "Kano"
        },
        {
          "name": "Winifred",
          "location": "Ogun"
        }
      ]
    },
    {
      "username": "jos",
      "contestants": [
        {
          "name": "Joy",
          "location": "Jos"
        },
        {
          "name": "Philip",
          "location": "Kano"
        }
      ]
    },
    {
      "username": "abuja",
      "contestants": [
        {
          "name": "Emmanuel",
          "location": "Abuja"
        },
        {
          "name": "Grace",
          "location": "Abuja"
        },
        {
          "name": "David",
          "location": "Port Harcourt"
        }
      ]
    }
  ]
}
```

## 🎯 **KEY CORRECTIONS MADE:**

1. ✅ **API Endpoint**: `POST /quiz` (not `/quiz/create`)
2. ✅ **Payload Structure**: Uses `name`, `users`, `contestants` structure
3. ✅ **Auto-User Creation**: Service creates users automatically
4. ✅ **Rounds Configuration**: Properly structured with `questionsPerParticipant`
5. ✅ **Authentication Handling**: Added notes about password issue

**Your quiz system is correctly implemented - I had the wrong API documentation initially!** 🎯

The quiz creation service matches exactly what you showed me. My apologies for the confusion in the initial documentation.
