# Manager Password Change & MFA Guide

## Overview

This guide covers the password change and Multi-Factor Authentication (MFA) features added to the SoyaFlow manager app. These security features are designed to enhance account security for managers.

## Features

### 1. Password Change
- Secure password change endpoint
- Requires current password verification
- Password strength validation (minimum 8 characters)
- Confirmation password matching

### 2. Multi-Factor Authentication (MFA)
- Time-based One-Time Password (TOTP) implementation
- QR code generation for easy setup
- Compatible with authenticator apps (Google Authenticator, Authy, Microsoft Authenticator, etc.)
- Optional feature - can be enabled/disabled by each manager

---

## API Endpoints

### Authentication Endpoints

#### 1. Change Password
**POST** `/api/auth/change-password/`

Change the current user's password.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "old_password": "current_password",
  "new_password": "new_secure_password",
  "confirm_password": "new_secure_password"
}
```

**Success Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `400`: Missing fields or passwords don't match
- `400`: Current password is incorrect
- `400`: Password too weak (< 8 characters)

---

### MFA Endpoints

#### 2. Setup MFA
**POST** `/api/auth/mfa/setup/`

Initialize MFA setup and get QR code for authenticator app.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "totp_uri": "otpauth://totp/SoyaFlow:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=SoyaFlow"
}
```

**Error Response:**
- `403`: Only managers can enable MFA

**Frontend Usage:**
1. Display the QR code image to the user
2. Ask user to scan with their authenticator app
3. Ask user to enter the 6-digit code from their app
4. Call the verify-setup endpoint with the code

---

#### 3. Verify MFA Setup
**POST** `/api/auth/mfa/verify-setup/`

Verify MFA code and enable MFA for the account.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "message": "MFA enabled successfully"
}
```

**Error Responses:**
- `400`: Missing code
- `400`: Please setup MFA first
- `400`: Invalid MFA code
- `403`: Only managers can enable MFA

---

#### 4. Disable MFA
**POST** `/api/auth/mfa/disable/`

Disable MFA for the current user (requires password confirmation).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "password": "user_password"
}
```

**Success Response (200):**
```json
{
  "message": "MFA disabled successfully"
}
```

**Error Responses:**
- `400`: Missing password
- `400`: Incorrect password
- `404`: Manager profile not found

---

#### 5. Login (Updated)
**POST** `/api/auth/login/`

Login with username and password. If MFA is enabled, returns `mfa_required: true`.

**Request Body:**
```json
{
  "username": "manager1",
  "password": "password123"
}
```

**Success Response - No MFA (200):**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "username": "manager1",
    "email": "manager@example.com",
    "full_name": "John Doe",
    "is_manager": true,
    "mfa_enabled": false
  }
}
```

**Success Response - MFA Required (200):**
```json
{
  "mfa_required": true,
  "username": "manager1",
  "message": "Please provide your MFA code"
}
```

**Frontend Flow:**
1. POST credentials to `/api/auth/login/`
2. If response contains `mfa_required: true`:
   - Show MFA code input field
   - Ask user for 6-digit code from authenticator app
   - POST to `/api/auth/mfa/verify-login/` with username and code
3. If no MFA required, proceed with tokens as usual

---

#### 6. Verify MFA Login
**POST** `/api/auth/mfa/verify-login/`

Complete login by verifying MFA code.

**Request Body:**
```json
{
  "username": "manager1",
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "username": "manager1",
    "email": "manager@example.com",
    "full_name": "John Doe",
    "is_manager": true,
    "mfa_enabled": true
  }
}
```

**Error Responses:**
- `400`: Missing username or code
- `400`: MFA is not enabled for this account
- `401`: Invalid MFA code
- `404`: User not found

---

## Database Changes

### Manager Model Fields Added

```python
# Multi-Factor Authentication (MFA) fields
mfa_enabled = models.BooleanField(default=False, help_text="Whether MFA is enabled for this manager")
mfa_secret = models.CharField(max_length=32, blank=True, default='', help_text="TOTP secret key for MFA")
```

### Migration

Run the following command to apply the database changes:

```bash
cd /var/www/soyaflow/backend
source venv/bin/activate
python manage.py migrate manager
```

---

## Dependencies

Added to `requirements.txt`:

```txt
pyotp==2.9.0  # TOTP for MFA
qrcode==8.0  # QR code generation for MFA setup
```

### Installation

```bash
cd /var/www/soyaflow/backend
source venv/bin/activate
pip install pyotp==2.9.0 qrcode==8.0
```

---

## Frontend Implementation Examples

### 1. Password Change Form

```typescript
async function changePassword(oldPassword: string, newPassword: string, confirmPassword: string) {
  const response = await fetch('https://soyaflow.com/api/auth/change-password/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      old_password: oldPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.json();
}
```

### 2. MFA Setup Flow

```typescript
// Step 1: Setup MFA
async function setupMFA() {
  const response = await fetch('https://soyaflow.com/api/auth/mfa/setup/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  const data = await response.json();
  // Display data.qr_code image to user
  return data;
}

// Step 2: Verify setup with code from authenticator app
async function verifyMFASetup(code: string) {
  const response = await fetch('https://soyaflow.com/api/auth/mfa/verify-setup/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ code })
  });

  return await response.json();
}
```

### 3. Login with MFA

```typescript
async function login(username: string, password: string) {
  const response = await fetch('https://soyaflow.com/api/auth/login/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();

  if (data.mfa_required) {
    // Show MFA code input
    return { requiresMFA: true, username: data.username };
  }

  // Normal login, save tokens
  return { tokens: data, requiresMFA: false };
}

async function verifyMFALogin(username: string, code: string) {
  const response = await fetch('https://soyaflow.com/api/auth/mfa/verify-login/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, code })
  });

  return await response.json();
}
```

### 4. Disable MFA

```typescript
async function disableMFA(password: string) {
  const response = await fetch('https://soyaflow.com/api/auth/mfa/disable/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ password })
  });

  return await response.json();
}
```

---

## Security Considerations

### Password Requirements
- Minimum 8 characters (can be increased in production)
- Must provide current password to change
- Confirmation password required
- Consider adding password complexity rules in production:
  - Uppercase and lowercase letters
  - Numbers
  - Special characters

### MFA Security
- TOTP secrets are generated using `pyotp.random_base32()`
- Codes expire every 30 seconds
- Valid window of 1 period (30 seconds) for clock skew
- Secrets are stored securely in the database
- MFA can only be disabled with password confirmation

### Best Practices
1. **Force Password Change**: Consider implementing periodic password changes
2. **MFA Backup Codes**: Consider adding backup codes for MFA recovery
3. **Account Recovery**: Implement secure account recovery flow
4. **Audit Logging**: Log all password changes and MFA events
5. **Rate Limiting**: Implement rate limiting on authentication endpoints
6. **Session Management**: Invalidate sessions on password change

---

## Testing

### Manual Testing Steps

#### Password Change:
1. Login as a manager
2. POST to `/api/auth/change-password/` with valid credentials
3. Verify password is changed
4. Try logging in with new password

#### MFA Setup:
1. Login as a manager
2. POST to `/api/auth/mfa/setup/`
3. Scan QR code with authenticator app (Google Authenticator, Authy, etc.)
4. POST to `/api/auth/mfa/verify-setup/` with code from app
5. Logout and login again
6. Verify MFA code is required
7. Enter code from authenticator app
8. Verify successful login

#### MFA Disable:
1. Login as a manager with MFA enabled
2. POST to `/api/auth/mfa/disable/` with password
3. Logout and login again
4. Verify MFA is not required

---

## Troubleshooting

### Common Issues

**"Invalid MFA code" error:**
- Ensure device time is synchronized (TOTP is time-based)
- Code expires every 30 seconds, try a fresh code
- Check that the secret hasn't been regenerated

**QR Code not displaying:**
- Check that `qrcode` library is installed
- Verify the base64 image data is being returned
- Ensure frontend is rendering the data URI correctly

**"Only managers can enable MFA" error:**
- Verify user has a Manager profile in the database
- Only users with Manager profiles can use MFA

---

## Production Deployment Notes

When deploying to production:

1. **Install dependencies:**
   ```bash
   pip install pyotp==2.9.0 qrcode==8.0
   ```

2. **Run migrations:**
   ```bash
   python manage.py migrate manager
   ```

3. **Restart services:**
   ```bash
   sudo supervisorctl restart soyaflow-backend
   ```

4. **Update DEPLOYMENT.MD** if needed to include these steps

---

## Support

For issues or questions:
- Check logs: `/var/log/soyaflow-backend.log`
- Review this guide
- Test with cURL or Postman before implementing in frontend
- Ensure all dependencies are installed

---

**Last Updated:** January 2026
**Features:** Password Change, TOTP-based MFA
**Compatible with:** Django 5.1.6, Django REST Framework 3.15.2
