# 📚 Question Management System Documentation

## 🎯 Overview

The Question Management System provides comprehensive functionality for creating, managing, and validating questions for quiz rounds. It supports multiple question types, bulk uploads, and automatic validation to ensure quiz integrity.

## 🔧 Question Types

### **1. Multiple Choice Questions**

- **Type:** `multiple_choice`
- **Options:** 4 options (A, B, C, D)
- **Format:** `["Option A", "Option B", "Option C", "Option D"]`
- **Answer Index:** 0-3 (which option is correct)

### **2. Yes/No Questions**

- **Type:** `yes_no`
- **Options:** 2 options (Yes, No)
- **Format:** `["Yes", "No"]`
- **Answer Index:** 0 (Yes) or 1 (No)

### **3. Simultaneous Questions**

- **Type:** `simultaneous`
- **Behavior:** All participants answer all questions at once
- **Points:** 5 points per correct answer

## 📊 Question Number System (Tile System)

Questions are numbered sequentially (1, 2, 3, ...) for frontend tile display:

```
Frontend Display:
[1]  [2]  [3]  [4]  [5]
[6]  [7]  [8]  [9]  [10]
[11] [12] [13] [14] [15]
...
```

When a participant clicks tile #7, the system fetches question #7 from the database.

## 🧮 Question Requirements Calculation

### **Formula:**

```
Required Questions = (Participant Count × Questions Per Participant) + Buffer Questions
```

### **Example:**

- **10 participants**
- **3 questions per participant**
- **5 buffer questions**
- **Total needed:** (10 × 3) + 5 = **35 questions**

### **Buffer Questions Purpose:**

- Prevent running out of questions during quiz
- Allow for question variety
- Handle bonus questions without issues

## 🔄 Quiz Flow and Round Management

### **Round Prerequisites:**

1. **Question Validation:** Sufficient questions of correct type
2. **Sequential Dependency:** Can't start Round 2 until Round 1 is complete
3. **Participant Setup:** Participant order must be established

### **Round Start Validation:**

```typescript
// Before starting Round 1 (multiple_choice)
Required: 35 multiple_choice questions
Available: 20 multiple_choice questions
Status: ❌ BLOCKED - Need 15 more questions

// After adding questions
Required: 35 multiple_choice questions
Available: 40 multiple_choice questions
Status: ✅ READY TO START
```

## 🎯 Point System

Points are calculated dynamically in the gateway based on quiz type:

```typescript
const calculatePoints = (quizType: string, isBonus: boolean) => {
  if (isBonus) return 1; // Bonus questions always 1 point

  switch (quizType) {
    case 'multiple_choice':
    case 'yes_no':
      return 2; // Sequential modes: 2 points per question
    case 'simultaneous':
      return 5; // Simultaneous mode: 5 points per question
    default:
      return 1;
  }
};
```

### **Bonus Logic:**

1. **Original Question:** 2 points if answered correctly
2. **Bonus Question:** 1 point if answered correctly
3. **Total Possible:** 3 points per question cycle (2 + 1)

## 📝 API Endpoints

### **Create Single Question**

```http
POST /questions/:quizId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "questionText": "What is the capital of Nigeria?",
  "questionType": "multiple_choice",
  "options": ["Lagos", "Port Harcourt", "Abuja", "Kano"],
  "correctAnswerIndex": 2,
  "difficulty": "medium"
}
```

### **Bulk Create Questions**

```http
POST /questions/:quizId/bulk
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "questions": [
    {
      "questionText": "What is 2 + 2?",
      "questionType": "multiple_choice",
      "options": ["3", "4", "5", "6"],
      "correctAnswerIndex": 1,
      "difficulty": "easy"
    },
    {
      "questionText": "Is the earth round?",
      "questionType": "yes_no",
      "options": ["Yes", "No"],
      "correctAnswerIndex": 0,
      "difficulty": "easy"
    }
  ]
}
```

### **Upload from CSV/Excel**

```http
POST /questions/:quizId/upload
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

file: questions.csv (or questions.xlsx)
```

### **Get Questions with Filters**

```http
GET /questions/:quizId?questionType=multiple_choice&isAnswered=false&difficulty=medium
Authorization: Bearer <jwt_token>
```

### **Get Question Requirements**

```http
GET /questions/:quizId/requirements
Authorization: Bearer <jwt_token>
```

### **Get Question Statistics**

```http
GET /questions/:quizId/stats
Authorization: Bearer <jwt_token>
```

## 📄 CSV Upload Format

Use the provided `question-template.csv` as a reference:

```csv
questionText,questionType,correctAnswerIndex,option1,option2,option3,option4,difficulty
"What is the capital of Nigeria?",multiple_choice,2,"Lagos","Port Harcourt","Abuja","Kano","medium"
"Is the earth round?",yes_no,0,"Yes","No","","","easy"
"Which programming language is used for web development?",multiple_choice,1,"Python","JavaScript","C++","Java","medium"
```

### **CSV Rules:**

1. **Headers:** Must match exactly as shown
2. **Question Types:** `multiple_choice` or `yes_no`
3. **Answer Index:** 0-based (0 = first option)
4. **Empty Options:** For yes/no questions, leave option3 and option4 empty
5. **Difficulty:** `easy`, `medium`, or `hard`

## 🔌 WebSocket Events

### **Check Round Readiness**

```javascript
socket.emit('checkRoundReadiness', {
  quizId: 'quiz_id',
  roundId: 'round_id',
});

// Response
socket.on('roundReadinessCheck', (data) => {
  console.log('Round readiness:', data);
  /*
  {
    roundId: 'round_id',
    roundNumber: 1,
    quizType: 'multiple_choice',
    isReady: true,
    canStart: true,
    questionRequirements: {
      required: 35,
      available: 40,
      shortage: 0,
      participantCount: 10,
      questionsPerParticipant: 3,
      bufferQuestions: 5
    },
    prerequisites: {
      previousRoundsCompleted: true,
      incompletePreviousRounds: []
    }
  }
  */
});
```

## 🚨 Error Handling

### **Common Errors:**

1. **Insufficient Questions:**

```json
{
  "error": "Insufficient questions for this round. Need 15 more multiple_choice questions."
}
```

2. **Invalid Question Type:**

```json
{
  "error": "Invalid question type. Must be 'multiple_choice' or 'yes_no'"
}
```

3. **Round Prerequisites Not Met:**

```json
{
  "error": "Cannot start Round 2. Round 1 must be completed first."
}
```

4. **Invalid CSV Format:**

```json
{
  "error": "Invalid CSV format. Missing required headers: questionText, questionType, correctAnswerIndex"
}
```

## 🎮 Frontend Integration

### **Question Display Component:**

```javascript
// Show question tiles (1-40)
const QuestionTiles = ({ questions, onTileClick }) => {
  return (
    <div className="question-grid">
      {questions.map((q, index) => (
        <div
          key={q.id}
          className={`tile ${q.isAnswered ? 'answered' : 'available'}`}
          onClick={() => onTileClick(q.questionNumber)}
        >
          {q.questionNumber}
        </div>
      ))}
    </div>
  );
};
```

### **Moderator Round Controls:**

```javascript
// Check if round can start
const checkRoundReadiness = (roundId) => {
  socket.emit('checkRoundReadiness', { quizId, roundId });
};

// Start round if ready
const startRound = (roundId) => {
  socket.emit('startRound', { quizId, roundId });
};
```

## ⚡ Performance Optimizations

### **Redis Caching:**

- Questions cached per round to avoid DB queries
- Participant order cached for quick access
- Question validation results cached

### **Database Indexes:**

- `[quizId, questionType, isAnswered]` - Fast question filtering
- `[quizId, questionNumber]` - Unique tile numbers
- `[quizId, isAnswered]` - General question queries

### **Memory Management:**

- In-memory maps for active quiz states
- Automatic cleanup on quiz completion
- Efficient question loading with `take` limits

## 🔒 Security & Validation

### **Role-Based Access:**

- **MODERATOR:** Can create, edit, delete questions
- **CONTESTANT:** Can only view questions during quiz
- **AUDIENCE:** Can only observe quiz

### **Input Validation:**

- Question text length limits (1-1000 characters)
- Option count validation (2 for yes/no, 4 for multiple choice)
- Answer index bounds checking
- File type validation for uploads

### **Business Logic Validation:**

- Prevent starting rounds without sufficient questions
- Enforce round completion order
- Validate participant requirements

This documentation provides a complete guide to understanding and implementing the question management system in your quiz application!
