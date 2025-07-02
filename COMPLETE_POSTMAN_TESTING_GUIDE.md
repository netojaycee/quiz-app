# Complete Postman Testing Guide for Quiz System

## Prerequisites Setup

### 1. Start Redis Server

```bash
# Using Docker
docker run -d --name redis-quiz -p 6379:6379 redis:latest
```

### 2. Start NestJS Application

```bash
cd c:\Users\Jaycee\Documents\projects\web\teenage-quiz\v2\backend
npm run start:dev
```

### 3. Base URL

```
http://localhost:3000
```

## Phase 1: User Management & Authentication

### Step 1: Create Test Users

**A. Create Moderator (if not exists)**

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

**B. Create 4 Contestants**

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "contestant1",
  "email": "contestant1@test.com",
  "password": "password123",
  "role": "CONTESTANT"
}
```

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "contestant2",
  "email": "contestant2@test.com",
  "password": "password123",
  "role": "CONTESTANT"
}
```

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "contestant3",
  "email": "contestant3@test.com",
  "password": "password123",
  "role": "CONTESTANT"
}
```

```http
POST http://localhost:3000/auth/register
Content-Type: application/json

{
  "username": "contestant4",
  "email": "contestant4@test.com",
  "password": "password123",
  "role": "CONTESTANT"
}
```

**C. Create Audience**

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

### Step 2: Login and Get Tokens

**Login each user and save their JWT tokens:**

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "moderator@test.com",
  "password": "password123"
}
```

Save the `access_token` from each response. You'll need:

- `MODERATOR_TOKEN`
- `CONTESTANT1_TOKEN`
- `CONTESTANT2_TOKEN`
- `CONTESTANT3_TOKEN`
- `CONTESTANT4_TOKEN`
- `AUDIENCE_TOKEN`

### Step 3: Get User IDs

```http
GET http://localhost:3000/users
Authorization: Bearer {{MODERATOR_TOKEN}}
```

Save the user IDs for each contestant to use in quiz creation.

## Phase 2: Quiz Creation

### Step 4: Create Quiz

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

**Save the returned `quiz.id` as `QUIZ_ID`**

**Important Notes:**

1. **API Endpoint**: Use `POST /quiz` (not `/quiz/create`)
2. **User Creation**: This API automatically creates user accounts for `team_lagos` and `team_abuja`
3. **Contestant Creation**: All 4 contestants are created automatically
4. **Authentication**: You'll need to get JWT tokens for the created users separately

### Step 5: Upload Questions

Use the provided CSV file `QUIZ_QUESTIONS_TEMPLATE.csv`:

```http
POST http://localhost:3000/questions/{{QUIZ_ID}}/upload
Authorization: Bearer {{MODERATOR_TOKEN}}
Content-Type: multipart/form-data

file: [Upload the CSV file]
```

### Step 6: Verify Questions

```http
GET http://localhost:3000/questions/{{QUIZ_ID}}
Authorization: Bearer {{MODERATOR_TOKEN}}
```

## Phase 3: WebSocket Testing Setup

### WebSocket Connection Details:

- **URL**: `ws://localhost:3000`
- **Namespace**: `/` (default)
- **Authentication**: Include JWT token in connection headers

### Step 7: Connect Users via WebSocket

You'll need to simulate WebSocket connections for:

1. Moderator
2. 4 Contestants
3. 1 Audience member

**Connection Format:**

```javascript
// Headers for WebSocket connection
{
  "Authorization": "Bearer {{TOKEN}}"
}
```

**Join Quiz Room (send this message after connecting):**

```json
{
  "event": "joinQuiz",
  "data": {
    "quizId": "{{QUIZ_ID}}"
  }
}
```

## Phase 4: Round 1 Testing (Yes/No Sequential)

### Step 8: Start Round 1

**Moderator sends:**

```json
{
  "event": "startRound",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND1_ID}}"
  }
}
```

**Expected Events:**

- `roundStarted` - All users receive
- `questionRevealed` - All users receive current question
- `participantTurn` - Shows whose turn it is

### Step 9: Answer Flow Testing

**A. Contestant selects answer:**

```json
{
  "event": "selectAnswer",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND1_ID}}",
    "questionId": "{{QUESTION_ID}}",
    "selectedIndex": 0
  }
}
```

**Expected Events:**

- `answerSelected` - All users see the selection

**B. Moderator confirms answer:**

```json
{
  "event": "confirmAnswer",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND1_ID}}",
    "questionId": "{{QUESTION_ID}}"
  }
}
```

**Expected Events:**

- `answerResult` - Shows correct/incorrect and points
- `leaderboardUpdate` - Updated scores
- `questionRevealed` - Next question (if any)
- `participantTurn` - Next participant's turn

### Step 10: Test Auto-Confirmation (Time Elapsed)

**Wait for timePerQuestion (20 seconds) without confirming:**

**Expected Events:**

- `answerAutoConfirmed` - Automatic confirmation
- `answerResult` - Feedback on the answer
- `leaderboardUpdate` - Updated scores

### Step 11: Verify Feedback System

**Check that each answer result contains:**

```json
{
  "userId": "user-id",
  "questionId": "question-id",
  "isCorrect": true/false,
  "points": 2/0,
  "answerType": "normal",
  "message": "Correct!" or "Incorrect!"
}
```

**Check leaderboard update:**

```json
{
  "leaderboard": [
    {
      "userId": "user-id",
      "username": "username",
      "totalPoints": 4,
      "position": 1
    }
  ]
}
```

## Phase 5: Round 2 Testing (Multiple Choice Sequential)

### Step 12: Start Round 2

**Moderator sends:**

```json
{
  "event": "startRound",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND2_ID}}"
  }
}
```

### Step 13: Test Multiple Choice Flow

**Same as Round 1, but with:**

- 30-second timer
- Multiple choice questions (4 options)
- Test selecting different indices (0, 1, 2, 3)

## Phase 6: Round 3 Testing (Simultaneous)

### Step 14: Start Simultaneous Round

**Moderator sends:**

```json
{
  "event": "startRound",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND3_ID}}"
  }
}
```

**Expected Events:**

- `simultaneousRoundStarted` - Each contestant gets unique questions
- Each contestant receives their own question set

### Step 15: Test Simultaneous Answers

**Each contestant submits answers:**

```json
{
  "event": "submitSimultaneousAnswer",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND3_ID}}",
    "questionId": "{{QUESTION_ID}}",
    "selectedIndex": 1,
    "questionNumber": 1
  }
}
```

**Expected Events:**

- `answerSubmitted` - Individual feedback to contestant
- `leaderboardUpdate` - Updated scores

### Step 16: Test Question Skipping

**Contestant skips question:**

```json
{
  "event": "skipQuestion",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND3_ID}}",
    "questionNumber": 2
  }
}
```

### Step 17: Test Early Session End

**Contestant ends session early:**

```json
{
  "event": "endSimultaneousSession",
  "data": {
    "quizId": "{{QUIZ_ID}}",
    "roundId": "{{ROUND3_ID}}"
  }
}
```

## Phase 7: Final Verification

### Step 18: Check Final Results

**Get final leaderboard:**

```http
GET http://localhost:3000/quiz/{{QUIZ_ID}}/leaderboard
Authorization: Bearer {{MODERATOR_TOKEN}}
```

**Get quiz statistics:**

```http
GET http://localhost:3000/quiz/{{QUIZ_ID}}/stats
Authorization: Bearer {{MODERATOR_TOKEN}}
```

## Testing Checklist

### ✅ Functionality Tests:

- [ ] User registration and login
- [ ] Quiz creation with custom parameters
- [ ] Question upload via CSV
- [ ] WebSocket connections for all user types
- [ ] Round 1: Yes/No sequential with proper timing
- [ ] Round 2: Multiple choice sequential with 30s timer
- [ ] Round 3: Simultaneous mode with unique questions
- [ ] Answer feedback (correct/incorrect messages)
- [ ] Score updates and leaderboard
- [ ] Auto-confirmation on timeout
- [ ] Question skipping in simultaneous mode
- [ ] Early session termination
- [ ] Final winner determination

### ✅ Real-time Events:

- [ ] `answerResult` with correct feedback
- [ ] `leaderboardUpdate` with accurate scores
- [ ] `questionRevealed` for next questions
- [ ] `participantTurn` for active participant
- [ ] `answerSelected` for contestant selections
- [ ] `answerAutoConfirmed` for timeouts
- [ ] `simultaneousRoundStarted` with unique questions
- [ ] `answerSubmitted` for simultaneous feedback

### ✅ Performance Tests:

- [ ] Response time under 100ms for API calls
- [ ] WebSocket event delivery under 50ms
- [ ] Proper cleanup of Redis cache
- [ ] Memory usage remains stable
- [ ] No memory leaks during extended testing

## WebSocket Testing Tools

### Recommended Tools:

1. **Postman** - Has WebSocket support
2. **WebSocket King** - Chrome extension
3. **wscat** - Command line tool
4. **Socket.IO Client** - Browser-based testing

### Example wscat commands:

```bash
# Install wscat
npm install -g wscat

# Connect and test
wscat -c ws://localhost:3000 -H "Authorization: Bearer {{TOKEN}}"
```

## Debugging Tips

### 1. Check Application Logs

Monitor your NestJS console for detailed logs of all events.

### 2. Redis Debugging

```bash
# Connect to Redis
docker exec -it redis-quiz redis-cli

# Monitor all commands
monitor

# Check quiz data
keys quiz:*
```

### 3. Database Verification

Check your database to ensure:

- Responses are saved correctly
- Scores are calculated properly
- User data is updated

This comprehensive testing guide should help you thoroughly test all aspects of your quiz system!
