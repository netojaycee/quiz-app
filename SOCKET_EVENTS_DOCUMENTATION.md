# Socket.IO Quiz System Events Documentation

This document describes all the Socket.IO events for the real-time quiz system.

## Connection

### Namespace

All quiz events use the `/quiz` namespace.

### Authentication

Include JWT token in socket handshake auth:

```javascript
const socket = io('http://localhost:3300/quiz', {
  auth: {
    userId: 'user_id_from_jwt',
  },
});
```

## Events

### 1. Join Quiz Room

**Event:** `joinQuiz`
**Direction:** Client → Server
**Who can use:** All authenticated users

```typescript
// Emit
socket.emit('joinQuiz', {
  quizId: string,
  userId?: string // Optional, can be extracted from JWT
});

// Response
socket.on('quizJoined', {
  quizId: string,
  role: 'MODERATOR' | 'CONTESTANT' | 'AUDIENCE',
  username: string,
  participantOrder?: Array<{userId: string, username: string, orderIndex: number}>, // Not for AUDIENCE
  isActive: boolean
});

// Broadcast to others in room
socket.on('userJoined', {
  userId: string,
  username: string,
  role: 'MODERATOR' | 'CONTESTANT' | 'AUDIENCE'
});
```

**Usage:**

- **Contestants:** Auto-called after login with their assigned quiz
- **Moderators/Audience:** Manually called with specific quiz ID

---

### 2. Update Participant Order (Drag & Drop Support)

**Event:** `updateParticipantOrder`
**Direction:** Client → Server
**Who can use:** MODERATOR only
**When:** Only before first round starts

```typescript
// Emit
socket.emit('updateParticipantOrder', {
  quizId: string,
  participantOrder: Array<{
    userId: string;
    orderIndex: number;
  }>,
});

// Broadcast to all in room
socket.on('participantOrderUpdated', {
  participantOrder: Array<{ userId: string; orderIndex: number }>,
});
```

**Frontend Implementation:**

```javascript
// When user drags and drops participants
const newOrder = participants.map((participant, index) => ({
  userId: participant.userId,
  orderIndex: index,
}));

socket.emit('updateParticipantOrder', {
  quizId: currentQuizId,
  participantOrder: newOrder,
});
```

---

### 3. Start Round

**Event:** `startRound`
**Direction:** Client → Server
**Who can use:** MODERATOR only

```typescript
// Emit
socket.emit('startRound', {
  quizId: string,
  roundId: string
});

// Response - For Simultaneous Mode
socket.on('roundStarted', {
  roundId: string,
  quizType: 'simultaneous',
  questions: Array<{
    id: string,
    questionText: string,
    options: string[],
    points: number
  }>,
  timePerQuestion: number,
  pointsPerCorrect: 5
});

// Response - For Sequential Mode (multiple_choice, yes_no)
socket.on('roundStarted', {
  roundId: string,
  quizType: 'multiple_choice' | 'yes_no',
  currentQuestion: {
    id: string,
    questionText: string,
    options: string[],
    points: number
  },
  activeUserId: string,
  participantOrder: Array<{userId: string, username: string, orderIndex: number}>,
  timePerQuestion: number,
  pointsPerCorrect: 1
});
```

---

### 4. Submit Answer

**Event:** `submitAnswer`
**Direction:** Client → Server
**Who can use:** CONTESTANT only

```typescript
// Emit
socket.emit('submitAnswer', {
  quizId: string,
  roundId: string,
  questionId: string,
  selectedIndex: number, // 0, 1, 2, etc.
});

// For Simultaneous Mode - Immediate Response
socket.on('answerResult', {
  userId: string,
  questionId: string,
  isCorrect: boolean,
  points: number,
  message: string,
});

// For Sequential Mode - Pending Confirmation
socket.on('answerSubmitted', {
  message: 'Answer submitted, waiting for moderator confirmation',
});

// Broadcast to all (pending confirmation)
socket.on('answerPendingConfirmation', {
  userId: string,
  questionId: string,
  selectedIndex: number,
  timestamp: number,
});
```

**Sequential Mode Flow:**

1. Contestant submits answer
2. Answer goes to pending state
3. Moderator sees pending answer
4. Moderator confirms/rejects
5. Result is broadcast

---

### 5. Confirm Answer (Moderator)

**Event:** `confirmAnswer`
**Direction:** Client → Server
**Who can use:** MODERATOR only
**When:** Sequential modes only

```typescript
// Emit
socket.emit('confirmAnswer', {
  quizId: string,
  roundId: string,
  userId: string,
  isConfirmed: boolean,
});

// Broadcast result after confirmation
socket.on('answerResult', {
  userId: string,
  questionId: string,
  isCorrect: boolean,
  points: number,
  message: string,
});
```

---

### 6. Next Participant

**Event:** `nextParticipant`
**Direction:** Client → Server
**Who can use:** MODERATOR only
**When:** Sequential modes only

```typescript
// Emit
socket.emit('nextParticipant', {
  quizId: string,
  roundId: string
});

// Response
socket.on('nextParticipant', {
  activeUserId: string,
  currentQuestion: {
    id: string,
    questionText: string,
    options: string[],
    points: number
  } | null, // null if round is complete
  questionIndex: number
});

// When round is complete
socket.on('roundCompleted', {
  roundId: string
});
```

---

### 7. Get Quiz State

**Event:** `getQuizState`
**Direction:** Client → Server
**Who can use:** All authenticated users

```typescript
// Emit
socket.emit('getQuizState', {
  quizId: string,
});

// Response
socket.on('quizState', {
  quiz: {
    id: string,
    name: string,
    isActive: boolean,
    rounds: Array<Round>,
    users: Array<User>,
    positions: Array<Position>,
  },
  participantOrder: Array<{ userId: string; username: string; orderIndex: number }>,
  activeUserId: string | null,
  isActive: boolean,
});
```

---

### 8. Leaderboard Updates

**Event:** `leaderboardUpdate`
**Direction:** Server → Client
**Automatic:** Sent after each correct answer

```typescript
socket.on('leaderboardUpdate', {
  leaderboard: Array<{
    position: number;
    user: { id: string; username: string };
    totalScore: number;
    totalQuestionsAnswered: number;
    totalQuestionsCorrect: number;
  }>,
});
```

---

### 9. Error Handling

**Event:** `error`
**Direction:** Server → Client

```typescript
socket.on('error', {
  message: string,
  error?: string
});
```

**Common error messages:**

- "User ID required"
- "User not found"
- "Quiz not found"
- "Not authorized for this quiz"
- "Only moderators can start rounds"
- "Not your turn to answer"
- "You have already answered this question"
- "Cannot change order after round has started"

---

## Complete Frontend Integration Example

```javascript
// Initialize socket connection
const socket = io('http://localhost:3300/quiz', {
  auth: {
    userId: userData.id,
  },
});

// For Contestants - Auto-join after login
if (userRole === 'CONTESTANT') {
  socket.emit('joinQuiz', { quizId: userQuizId });
}

// For Moderators/Audience - Manual join
function joinQuiz(quizId) {
  socket.emit('joinQuiz', { quizId });
}

// Handle participant order updates (moderator)
function updateParticipantOrder(newOrder) {
  socket.emit('updateParticipantOrder', {
    quizId: currentQuizId,
    participantOrder: newOrder,
  });
}

// Start a round (moderator)
function startRound(roundId) {
  socket.emit('startRound', {
    quizId: currentQuizId,
    roundId: roundId,
  });
}

// Submit answer (contestant)
function submitAnswer(questionId, selectedIndex) {
  socket.emit('submitAnswer', {
    quizId: currentQuizId,
    roundId: currentRoundId,
    questionId: questionId,
    selectedIndex: selectedIndex,
  });
}

// Confirm answer (moderator - sequential mode)
function confirmAnswer(userId, isConfirmed) {
  socket.emit('confirmAnswer', {
    quizId: currentQuizId,
    roundId: currentRoundId,
    userId: userId,
    isConfirmed: isConfirmed,
  });
}

// Next participant (moderator - sequential mode)
function nextParticipant() {
  socket.emit('nextParticipant', {
    quizId: currentQuizId,
    roundId: currentRoundId,
  });
}

// Listen for events
socket.on('quizJoined', (data) => {
  console.log('Joined quiz:', data);
  // Update UI with quiz state
});

socket.on('roundStarted', (data) => {
  console.log('Round started:', data);
  // Update UI for new round
});

socket.on('answerResult', (data) => {
  console.log('Answer result:', data);
  // Show feedback to user
});

socket.on('leaderboardUpdate', (data) => {
  console.log('Leaderboard updated:', data);
  // Update leaderboard display
});

socket.on('nextParticipant', (data) => {
  console.log('Next participant:', data);
  // Update active participant and question
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
  // Show error message to user
});
```

## Quiz Types and Scoring

### 1. Simultaneous Mode

- **Quiz Type:** `simultaneous`
- **Behavior:** All participants answer all questions at the same time
- **Scoring:** 5 points per correct answer
- **Flow:** All questions shown at once, participants answer at their own pace

### 2. Sequential Modes

- **Quiz Types:** `multiple_choice`, `yes_no`
- **Behavior:** Participants answer one by one in a predetermined order
- **Scoring:** 1 point per correct answer
- **Flow:**
  1. One question shown at a time
  2. Only active participant can answer
  3. Moderator confirms answer
  4. Move to next participant
  5. Cycle through all participants for each question

## Redis Caching Strategy

The system uses Redis for:

- **Question Caching:** Questions are cached when round starts
- **Participant Order:** Current participant sequence
- **Active State:** Which participant is currently answering
- **Session Data:** Round state, timing, progress
- **Answer Validation:** Quick validation without DB hits

## Database Schema Updates

New tables added:

- **ParticipantOrder:** Tracks the order of participants for sequential answering
- **User Role:** Added `AUDIENCE` role
- **Question Changes:** Added `isAnswered` flag and made `roundId` optional

This system provides a complete real-time quiz experience with support for different quiz types, role-based access, and efficient caching for performance.
