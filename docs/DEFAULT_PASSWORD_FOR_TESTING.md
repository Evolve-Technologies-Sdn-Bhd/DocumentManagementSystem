# Default Password for User Creation (Localhost Testing)

## Overview
For localhost testing purposes, when creating new users through the DMS system, a **default password** is automatically assigned if no password is provided.

## Default Password

```
Password123!
```

**⚠️ IMPORTANT: This is for TESTING ONLY on localhost. In production, implement proper password generation and email notification.**

## How It Works

### Backend (API)
- When creating a user via `POST /api/users`, the password field is now **optional**
- If no password is provided, the system automatically assigns: `Password123!`
- The password is properly hashed using bcrypt before storage
- Required fields are: `email`, `firstName`, `lastName`

**Code Location:** `backend/src/controllers/usersController.js` (line 84-85)

```javascript
// Use provided password or default to 'Password123!' for testing
const userPassword = password || 'Password123!';
```

### Frontend (UI)
The `AddUserModal` component currently **does not include a password input field**. This is intentional for the testing phase:
- Admins fill in user details (name, email, department, role)
- The backend automatically assigns the default password
- A yellow notification appears stating: "A temporary password will be generated and sent to the user's email address"

**Note:** Email notification is not yet implemented. Users must be manually informed of their default password.

## Testing Workflow

### 1. Create a New User (Admin)
1. Login as Administrator
2. Navigate to **Configuration** → **Role & Permissions** → **Users List**
3. Click "Add New User"
4. Fill in:
   - User Name: `Test User`
   - Email: `testuser@example.com`
   - Department: `IT`
   - Role: `Drafter` (or any role)
5. Click "Create User"

### 2. Login as the New User
1. Logout from admin account
2. Navigate to login page
3. Use credentials:
   - Email: `testuser@example.com`
   - Password: `Password123!`
4. Successfully logged in!

## API Usage

### Create User Without Password
```bash
POST http://localhost:5000/api/users
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "email": "newuser@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "department": "Engineering",
  "position": "Developer",
  "roleIds": [3]
}
```

**Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": 5,
      "email": "newuser@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "status": "ACTIVE"
    }
  }
}
```

The user can now login with:
- Email: `newuser@example.com`
- Password: `Password123!`

### Create User With Custom Password
```bash
POST http://localhost:5000/api/users
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "email": "newuser@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "MyCustomPassword456!",
  "roleIds": [3]
}
```

The `password` field is still supported if you want to specify a custom password.

## Security Considerations

### ⚠️ Current State (Testing Only)
- Default password is hardcoded in the controller
- All new users (without specified password) get the same default password
- No email notification system implemented
- Users cannot change their password yet (feature not implemented)

### ✅ For Production Implementation
You should implement:

1. **Random Password Generation**
   ```javascript
   const crypto = require('crypto');
   const userPassword = password || crypto.randomBytes(8).toString('hex') + '!A1';
   ```

2. **Email Notification Service**
   - Send temporary password via email
   - Include password reset link
   - Use services like SendGrid, Nodemailer, AWS SES

3. **Force Password Change on First Login**
   - Add `mustChangePassword: true` flag to new users
   - Redirect to password change page on first login
   - Validate password strength

4. **Password Reset Functionality**
   - "Forgot Password" flow
   - Reset token generation
   - Time-limited reset links

## Known Limitations

1. **No Email System**: Users must be manually informed of the default password
2. **Same Password for All**: All new users get `Password123!` if not specified
3. **No Password Change UI**: Users cannot change their password through the UI yet
4. **Frontend Not Connected**: The User Management UI is using mock data (TODO on line 540-545 of `RolePermission.jsx`)

## Recommended Next Steps

### Step 1: Connect Frontend to Backend API
Update `frontend/src/components/RolePermission.jsx` around line 540:

```javascript
const handleUserSubmit = async (userData) => {
  try {
    if (editingUser) {
      // Update existing user
      const response = await api.put(`/users/${editingUser.id}`, {
        firstName: userData.userName.split(' ')[0],
        lastName: userData.userName.split(' ').slice(1).join(' '),
        email: userData.email,
        department: userData.department,
        roleIds: userData.roles
      });
      // Update UI with response
    } else {
      // Create new user (password will default to 'Password123!')
      const response = await api.post('/users', {
        firstName: userData.userName.split(' ')[0],
        lastName: userData.userName.split(' ').slice(1).join(' '),
        email: userData.email,
        department: userData.department,
        roleIds: userData.roles
      });
      // Update UI with response
    }
  } catch (error) {
    console.error('Failed to save user:', error);
    alert('Failed to save user: ' + error.message);
  }
};
```

### Step 2: Add Password Change Feature
Create a new endpoint and UI for users to change their password:
- `PUT /api/users/:id/password`
- Password strength validation
- Current password verification

### Step 3: Implement Password Reset Flow
- `POST /api/auth/forgot-password` - Request reset
- `POST /api/auth/verify-reset-code` - Verify code
- `POST /api/auth/reset-password-code` - Reset with code
- Email notification with 6-digit reset code

## Current User Database

After running seed, you have:

| Email | Password | Roles |
|-------|----------|-------|
| `admin@dms.com` | `admin123` | Administrator |

When you create new users without specifying a password, they will have:

| Email | Password | Roles |
|-------|----------|-------|
| (user email) | `Password123!` | (assigned roles) |

## Testing Checklist

- [x] Backend accepts user creation without password
- [x] Default password `Password123!` is assigned
- [x] Password is properly hashed with bcrypt
- [x] New user can login with default password
- [ ] Frontend connected to real API (TODO)
- [ ] Email notification implemented (TODO)
- [ ] Password change feature (TODO)
- [ ] Password reset flow (TODO)

## Summary

**For localhost testing, all newly created users (without a specified password) will have the default password:**

```
Password123!
```

**Make sure to inform test users of this password, or specify a custom password when creating users via the API.**

**⚠️ Before deploying to production, implement proper password generation, email notifications, and password management features.**
