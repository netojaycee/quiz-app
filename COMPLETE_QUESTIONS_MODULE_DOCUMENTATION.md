# Complete Questions Module Documentation

## Overview

The Questions Module provides comprehensive CRUD operations for quiz questions with support for bulk uploads, file imports (CSV/Excel), and integration with the quiz real-time system.

## Architecture

### Database Schema

```prisma
model Question {
    id                 String      @id @default(cuid())
    quizId             String
    questionNumber     Int         // Tile number (1, 2, 3...) - for frontend tile display
    questionText       String
    questionType       QuizType    @default(multiple_choice) // "multiple_choice", "yes_no"
    options            Json        // ["Option 1", "Option 2", "Option 3", "Option 4"] or ["Yes", "No"]
    correctAnswerIndex Int         // Index of correct answer (0, 1, 2, 3 for multiple choice, 0 or 1 for yes/no)
    isAnswered         Boolean     @default(false) // Track if question has been used in any round
    difficulty         Difficulty? @default(medium) // "easy", "medium", "hard"
    createdAt          DateTime    @default(now())
    updatedAt          DateTime    @updatedAt

    quiz      Quiz       @relation(fields: [quizId], references: [id], onDelete: Cascade)
    responses Response[]

    @@unique([quizId, questionNumber]) // Ensure unique question numbers per quiz for tile system
    @@index([quizId, questionType, isAnswered]) // Optimize fetching unanswered questions by type
    @@index([quizId, isAnswered]) // Optimize fetching unanswered questions
}
```

### Module Structure

```
src/questions/
├── questions.module.ts          # Module configuration with Multer setup
├── questions.service.ts         # Core business logic
├── questions.controller.ts      # REST API endpoints
├── dto/
│   ├── create-question.dto.ts   # Input validation for question creation
│   ├── update-question.dto.ts   # Input validation for question updates
│   └── question-response.dto.ts # Response DTOs and stats
```

## API Endpoints

### POST /questions/:quizId

Create a single question for a quiz (MODERATOR only)

```json
{
  "questionText": "What is the capital of Nigeria?",
  "questionType": "multiple_choice",
  "options": ["Lagos", "Abuja", "Kano", "Ibadan"],
  "correctAnswerIndex": 1,
  "difficulty": "medium"
}
```

### POST /questions/:quizId/bulk

Bulk create questions for a quiz (MODERATOR only)

```json
{
  "questions": [
    {
      "questionText": "What is the capital of Nigeria?",
      "questionType": "multiple_choice",
      "options": ["Lagos", "Abuja", "Kano", "Ibadan"],
      "correctAnswerIndex": 1,
      "difficulty": "medium"
    }
  ]
}
```

### POST /questions/:quizId/upload

Upload questions from CSV/Excel file (MODERATOR only)

- Supports CSV and Excel files (up to 10MB)
- Auto-validates and transforms data
- Returns array of created questions

### GET /questions/:quizId

Get all questions for a quiz with optional filtering

- Query params: `questionType`, `isAnswered`, `difficulty`
- Available to all authenticated users

### GET /questions/:quizId/round/:roundType

Get questions suitable for a specific round type

- Filter by round type (multiple_choice, yes_no, simultaneous)
- Optional limit parameter
- Returns only unanswered questions

### GET /questions/:quizId/stats

Get question statistics for a quiz

```json
{
  "totalQuestions": 25,
  "answeredQuestions": 5,
  "unansweredQuestions": 20,
  "questionsByType": {
    "multiple_choice": 15,
    "yes_no": 10
  },
  "unansweredByType": {
    "multiple_choice": 12,
    "yes_no": 8
  }
}
```

### GET /questions/:quizId/requirements

Get question requirements analysis

```json
{
  "requiredQuestions": 30,
  "currentQuestions": 25,
  "shortfall": 5,
  "questionsByType": {
    "multiple_choice": {
      "required": 20,
      "current": 15,
      "shortfall": 5
    },
    "yes_no": {
      "required": 10,
      "current": 10,
      "shortfall": 0
    }
  }
}
```

### PATCH /questions/:quizId/:questionId

Update a specific question (MODERATOR only)

### DELETE /questions/:quizId/:questionId

Delete a specific question (MODERATOR only)

### POST /questions/:quizId/reset

Reset all questions in a quiz (mark as unanswered) (MODERATOR only)

### POST /questions/:quizId/:questionId/mark-answered

Mark a question as answered (MODERATOR only)

## File Upload Format

### CSV Template

```csv
questionText,questionType,option1,option2,option3,option4,correctAnswerIndex,difficulty
"What is the capital of Nigeria?",multiple_choice,"Lagos","Port Harcourt","Abuja","Kano",2,medium
"Is the earth round?",yes_no,"Yes","No","","",0,easy
```

### Expected Columns

1. **questionText**: The question text (required)
2. **questionType**: "multiple_choice" or "yes_no" (required)
3. **option1-option4**: Answer options (min 2 required)
4. **correctAnswerIndex**: Index of correct answer (0-based)
5. **difficulty**: "easy", "medium", or "hard" (optional, defaults to "medium")

## Key Features

### 1. Automatic Question Numbering

- Questions are automatically assigned sequential tile numbers (1, 2, 3...)
- Ensures unique numbering per quiz for frontend tile display
- Maintains order for consistent UI experience

### 2. Type Safety & Validation

- Strong type checking with Prisma enums
- Input validation with class-validator decorators
- Proper error handling and meaningful error messages

### 3. Round Integration

- Questions can be filtered by round type
- Integration with quiz gateway for round readiness checks
- Automatic marking of questions as answered during quiz flow

### 4. File Upload Support

- CSV and Excel file parsing
- Batch validation before creation
- Detailed error reporting for invalid rows

### 5. Caching Strategy

- Questions cached in Redis for performance
- Cache invalidation on CRUD operations
- Optimized queries with database indexes

## Integration with Quiz Gateway

### Round Readiness Check

The questions module integrates with the quiz gateway to provide:

- Real-time round readiness validation
- Question availability checks per round type
- Requirements analysis based on participant count

### Socket Event: `checkRoundReadiness`

```typescript
// Request
{
  quizId: "quiz_id",
  roundId: "round_id"
}

// Response
{
  roundId: "round_id",
  roundNumber: 1,
  quizType: "multiple_choice",
  isReady: true,
  canStart: true,
  questionRequirements: {
    required: 15,
    available: 20,
    shortage: 0,
    overallRequirements: {...}
  },
  prerequisites: {
    previousRoundsCompleted: true,
    incompletePreviousRounds: []
  }
}
```

## Error Handling

### Common Error Scenarios

1. **Invalid Question Type**: Ensures options match question type requirements
2. **Insufficient Options**: Minimum 2 options required
3. **Invalid Answer Index**: Must be within options array bounds
4. **Duplicate Question Numbers**: Prevented by unique constraints
5. **File Upload Errors**: Detailed row-by-row error reporting
6. **Quiz Not Found**: Proper validation before question operations

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

## Security Features

### Role-Based Access Control

- **MODERATOR**: Full CRUD access to questions
- **CONTESTANT**: Read-only access to assigned quiz questions
- **AUDIENCE**: Read-only access to public question data

### JWT Authentication

- All endpoints require valid JWT tokens
- WebSocket events use JWT authentication guards
- User context available in all operations

## Performance Optimizations

### Database Indexes

- Composite index on `[quizId, questionType, isAnswered]`
- Index on `[quizId, isAnswered]` for general queries
- Unique constraint on `[quizId, questionNumber]`

### Query Optimizations

- Selective field projection
- Proper use of database relationships
- Efficient filtering and sorting

### Caching Strategy

- Redis caching for frequently accessed questions
- Cache invalidation on data changes
- Optimized cache keys for different query patterns

## Testing Strategy

### Unit Tests

- Service method testing with mocked dependencies
- DTO validation testing
- Error handling verification

### Integration Tests

- API endpoint testing
- File upload testing
- Database interaction testing

### End-to-End Tests

- Complete quiz flow with questions
- Real-time quiz integration
- Multi-user scenario testing

## Future Enhancements

### Planned Features

1. **Question Categories**: Support for subject/topic categorization
2. **Media Support**: Images and videos in questions
3. **Question Templates**: Reusable question templates
4. **Advanced Analytics**: Question performance metrics
5. **Question Pool Management**: Shared question banks

### Scalability Considerations

1. **Database Sharding**: Questions by quiz ID
2. **CDN Integration**: For media file storage
3. **Queue System**: For large bulk operations
4. **Microservice Split**: Questions as separate service

## Usage Examples

### Creating Questions Programmatically

```typescript
// Single question
const question = await questionsService.create(quizId, {
  questionText: 'What is 2 + 2?',
  questionType: QuestionType.MULTIPLE_CHOICE,
  options: ['3', '4', '5', '6'],
  correctAnswerIndex: 1,
  difficulty: QuestionDifficulty.EASY,
});

// Bulk questions
const questions = await questionsService.createBulk(quizId, {
  questions: [
    // ... array of question DTOs
  ],
});
```

### File Upload Integration

```typescript
// Frontend file upload
const formData = new FormData();
formData.append('file', csvFile);

const response = await fetch(`/questions/${quizId}/upload`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

### Real-time Quiz Integration

```typescript
// Check round readiness
socket.emit('checkRoundReadiness', { quizId, roundId });

socket.on('roundReadinessCheck', (data) => {
  if (data.canStart) {
    // Enable start round button
  } else {
    // Show requirements and errors
  }
});
```

This documentation provides a complete reference for the Questions Module implementation, covering all aspects from basic CRUD operations to advanced integrations with the quiz system.
