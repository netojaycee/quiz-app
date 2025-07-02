# Bonus Logic Documentation

## Overview

The bonus logic is designed for sequential quiz modes (multiple_choice and yes_no) to enhance engagement and provide additional scoring opportunities when participants answer incorrectly.

## Flow Description

### Normal Sequential Flow

1. Participant A answers their question
2. Moderator confirms/rejects the answer
3. If correct: 1 point awarded, move to next participant
4. If incorrect: No points, move to next participant

### Bonus Flow (Sequential Modes Only)

1. Participant A answers their question incorrectly
2. Moderator rejects the answer
3. System offers bonus option to moderator
4. Moderator dispatches bonus to next participant (Participant B)
5. Participant B becomes active and answers the same question
6. If Participant B gets it right: 1 point to Participant B
7. System automatically returns to Participant A for their original question
8. Participant A answers their question again
9. If Participant A gets it right: 1 point to Participant A
10. System automatically moves to the next participant (Participant C)

## Point System

- **Simultaneous Mode**: 5 points per correct answer
- **Sequential Mode (Normal)**: 1 point per correct answer
- **Sequential Mode (With Bonus)**: 2 points total possible per question
  - 1 point for bonus answer (if correct)
  - 1 point for original answer (if correct)

## Socket Events

### New Events for Bonus Logic

#### `dispatchBonus`

**Direction**: Client → Server  
**Sender**: Moderator only  
**Purpose**: Award bonus question to next participant

```typescript
{
  quizId: string;
  questionId: string;
}
```

**Response**: `dispatchBonusResponse`

```typescript
{
  success: boolean;
  bonusUser: User;
  originalUser: User;
}
```

#### `bonusDispatched`

**Direction**: Server → All Clients  
**Purpose**: Notify all participants that bonus has been awarded

```typescript
{
  originalUser: User;
  bonusUser: User;
  questionId: string;
  activeParticipant: User;
}
```

#### `bonusCompleted`

**Direction**: Server → All Clients  
**Purpose**: Notify that bonus is complete and returning to original user

```typescript
{
  bonusUserId: string;
  originalUserId: string;
  activeParticipant: string;
}
```

### Updated Events

#### `answerResult`

**Enhanced with bonus information**:

```typescript
{
  userId: string;
  questionId: string;
  isCorrect: boolean;
  points: number;
  answerType: 'normal' | 'bonus' | 'original_return';
  message: string;
  canDispatchBonus?: boolean; // Only for incorrect answers in sequential mode
}
```

## State Management

### In-Memory State

- `bonusState`: Map tracking active bonus rounds
  ```typescript
  {
    originalUserId: string; // User who answered incorrectly
    bonusUserId: string; // User receiving bonus
    questionId: string; // Question being answered
    isActive: boolean; // Whether bonus is currently active
  }
  ```

### Redis Cache

- Bonus state is also cached in Redis for persistence
- Cache key: `quiz:{quizId}:bonusState`

## User Role Behavior

### MODERATOR

- Can dispatch bonus questions
- Confirms/rejects all answers in sequential modes
- Sees bonus option when answers are incorrect
- Controls quiz flow

### CONTESTANT

- Participates in normal and bonus rounds
- Can only answer when active
- Receives points for correct answers
- Part of participant order

### AUDIENCE

- **Pure spectator role**
- Cannot answer questions
- Not part of participant order
- Can see active participant and quiz state
- For simultaneous mode: sees grid view of all participants
- No actions available except viewing

## Frontend Considerations

### Audience View

- Show current active participant clearly
- For simultaneous mode: display grid of all participants
- Show leaderboard and quiz progress
- No interaction buttons/controls

### Bonus Flow UI

- Show bonus notification when dispatched
- Highlight that it's a bonus question
- Display return to original user clearly
- Auto-advance without manual "next participant" click

### Point Display

- Show answer type (normal/bonus/original_return)
- Display running totals clearly
- Highlight when bonus points are awarded

## Error Handling

### Bonus Dispatch Validation

- Only moderators can dispatch bonus
- Only available for sequential modes (multiple_choice, yes_no)
- Requires active participant and valid question
- Cannot dispatch if no next participant available

### State Cleanup

- Bonus state cleared after original user answers
- Cache cleared on quiz completion
- Handles disconnections gracefully

## Auto-Progression

- After bonus user answers: automatically return to original user
- After original user answers post-bonus: automatically advance to next participant
- 1-second delay for UI updates before auto-advancement
- No manual "next participant" clicks needed during bonus flow
