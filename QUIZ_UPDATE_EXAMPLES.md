# Quiz Update API Examples

This document provides comprehensive examples of how to use the updated Quiz API endpoints, particularly the quiz update functionality.

## Update Quiz Endpoint

`PATCH /quiz/:id`

The update functionality supports two modes of operation:

### 1. Replace Mode (Complete User Association Replacement)

When `existingUserIds` is provided, ALL user associations are replaced with the specified users plus any newly created users.

```json
{
  "name": "Updated Quiz Name",
  "isActive": true,
  "existingUserIds": ["user-id-1", "user-id-2"],
  "users": [
    {
      "username": "new_team_lagos",
      "contestants": [
        {
          "name": "New John",
          "location": "Lagos"
        },
        {
          "name": "New Jane",
          "location": "Lagos"
        }
      ]
    }
  ],
  "rounds": [
    {
      "roundNumber": 1,
      "quizType": "multiple_choice",
      "timePerQuestion": 30
    },
    {
      "roundNumber": 2,
      "quizType": "yes_no",
      "timePerQuestion": 15
    }
  ]
}
```

**Result**: The quiz will have exactly 3 users associated with it:

- user-id-1 (existing)
- user-id-2 (existing)
- newly created user for "new_team_lagos"

### 2. Additive Mode (Incremental User Management)

When `existingUserIds` is NOT provided, you can add/remove users incrementally:

#### Adding New Users Only

```json
{
  "name": "Updated Quiz Name",
  "users": [
    {
      "username": "team_abuja",
      "contestants": [
        {
          "name": "Ahmed",
          "location": "Abuja"
        },
        {
          "name": "Fatima",
          "location": "Abuja"
        }
      ]
    }
  ]
}
```

#### Adding Existing Users Only

```json
{
  "addExistingUserIds": ["user-id-3", "user-id-4"]
}
```

#### Removing Users

```json
{
  "removeUserIds": ["user-id-1", "user-id-2"]
}
```

#### Combined Additive Operations

```json
{
  "name": "Updated Quiz Name",
  "users": [
    {
      "username": "team_kaduna",
      "contestants": [
        {
          "name": "Musa",
          "location": "Kaduna"
        }
      ]
    }
  ],
  "addExistingUserIds": ["user-id-5"],
  "removeUserIds": ["user-id-1"]
}
```

**Result**:

- Creates new user "team_kaduna" and adds to quiz
- Adds existing user-id-5 to quiz
- Removes user-id-1 (and their contestants) from quiz

### 3. Other Update Operations

#### Update Basic Quiz Info Only

```json
{
  "name": "New Quiz Name",
  "isActive": false,
  "winnerId": "user-id-winner"
}
```

#### Update Rounds Only

```json
{
  "rounds": [
    {
      "roundNumber": 1,
      "quizType": "simultaneous",
      "timePerQuestion": 45
    }
  ]
}
```

**Note**: Updating rounds will delete all existing rounds and questions, then create new ones.

## Complete Postman Collection Examples

### 1. Create Quiz

```
POST http://localhost:3000/quiz
Authorization: Bearer <moderator-jwt-token>
Content-Type: application/json

{
  "name": "Teen Quiz Championship",
  "rounds": [
    {
      "roundNumber": 1,
      "quizType": "multiple_choice",
      "timePerQuestion": 30
    },
    {
      "roundNumber": 2,
      "quizType": "yes_no",
      "timePerQuestion": 15
    }
  ],
  "users": [
    {
      "username": "team_lagos",
      "contestants": [
        {
          "name": "John Doe",
          "location": "Lagos"
        },
        {
          "name": "Jane Smith",
          "location": "Lagos"
        }
      ]
    },
    {
      "username": "team_abuja",
      "contestants": [
        {
          "name": "Ahmed Hassan",
          "location": "Abuja"
        },
        {
          "name": "Fatima Ali",
          "location": "Abuja"
        }
      ]
    }
  ]
}
```

### 2. Update Quiz (Replace Mode)

```
PATCH http://localhost:3000/quiz/{{quiz-id}}
Authorization: Bearer <moderator-jwt-token>
Content-Type: application/json

{
  "name": "Updated Teen Quiz Championship",
  "existingUserIds": ["{{existing-user-id-1}}"],
  "users": [
    {
      "username": "team_kano",
      "contestants": [
        {
          "name": "Aminu Kano",
          "location": "Kano"
        }
      ]
    }
  ]
}
```

### 3. Update Quiz (Additive Mode)

```
PATCH http://localhost:3000/quiz/{{quiz-id}}
Authorization: Bearer <moderator-jwt-token>
Content-Type: application/json

{
  "users": [
    {
      "username": "team_jos",
      "contestants": [
        {
          "name": "Peter Gyang",
          "location": "Jos"
        }
      ]
    }
  ],
  "addExistingUserIds": ["{{another-existing-user-id}}"],
  "removeUserIds": ["{{user-id-to-remove}}"]
}
```

### 4. Team Login (Contestant)

```
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "username": "team_lagos"
}
```

### 5. Moderator Login

```
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "secure_password"
}
```

## Key Features of the Updated System

1. **Flexible User Management**: Choose between complete replacement or incremental updates
2. **Contestants Are Not Users**: Contestants are data objects associated with user/team accounts
3. **Bulk Operations**: Create multiple teams and contestants in a single API call
4. **Transaction Safety**: All operations are wrapped in database transactions
5. **Validation**: Comprehensive validation for usernames, rounds, and user existence
6. **Role-Based Authentication**: Different login requirements for moderators vs teams
7. **Cascading Updates**: When removing users, their contestants are also cleaned up
8. **Round Management**: Complete round replacement with validation for sequential numbering

## Important Notes

- **Username Uniqueness**: All usernames must be unique across the system
- **Round Validation**: Round numbers must be sequential starting from 1
- **Contestant Cleanup**: Removing users from a quiz also removes their contestants
- **Transaction Rollback**: If any part of an update fails, all changes are rolled back
- **Password Policy**: Team accounts have no password, moderator accounts require passwords
- **Quiz State**: Set `isActive: false` to disable a quiz without deleting it
