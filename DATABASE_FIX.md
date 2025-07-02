# Database Schema Fix Instructions

## Issue

The `password` field in the `users` table was created as `NOT NULL` in the initial migration, but the Prisma schema defines it as optional (`String?`). This causes errors when creating contestant users without passwords.

## Solution

### Option 1: Manual Database Update (Quick Fix)

Connect to your PostgreSQL database and run:

```sql
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
```

### Option 2: Using Prisma Migrate (Recommended)

When your database connection is stable, run:

```bash
cd backend
npx prisma migrate dev --name make_password_optional
```

### Option 3: Reset and Recreate (Nuclear Option)

If you don't have important data:

```bash
cd backend
npx prisma migrate reset --force
npx prisma migrate dev
```

## Test After Fix

1. **Create a moderator user:**

```bash
# Using psql or your database client
INSERT INTO "users" (id, username, password, role, "createdAt", "updatedAt")
VALUES (
  'mod_' || gen_random_uuid()::text,
  'admin',
  '$2b$10$example_hash_here',
  'MODERATOR',
  NOW(),
  NOW()
);
```

2. **Test the endpoints:**

```bash
# Login as moderator
POST /auth/login
{
  "username": "admin",
  "password": "your_password"
}

# Create quiz (with Bearer token)
POST /quiz
{
  "name": "Test Quiz",
  "rounds": [...],
  "users": [...]
}
```

## Code Changes Made

The quiz service has been updated to not set the password field for contestant users:

```typescript
// Before (causing error)
const newUser = await tx.user.create({
  data: {
    username: userData.username,
    password: null, // ❌ This caused the error
    role: 'CONTESTANT',
  },
});

// After (fixed)
const newUser = await tx.user.create({
  data: {
    username: userData.username,
    // ✅ Don't set password field at all for contestants
    role: 'CONTESTANT',
  },
});
```
