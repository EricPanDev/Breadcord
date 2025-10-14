# Moderation Cases API Documentation

## Overview

The Moderation Cases API provides access to moderation case data with authentication. This API allows you to query moderation cases by various criteria including case ID, user ID, and type.

**Base URL**: `http://localhost:8273`  
**Version**: 1.0.0  
**Authentication**: Bearer Token

## Authentication

All endpoints (except the root endpoint `/`) require authentication using a Bearer token in the `Authorization` header.

### Header Format

```
Authorization: Bearer YOUR_TOKEN_HERE
```

Or alternatively:

```
Authorization: YOUR_TOKEN_HERE
```

### Managing Auth Tokens

Auth tokens are stored in `Auth.txt` (one token per line). The API automatically reloads tokens when the file is modified.

**Example Auth.txt:**
```
# Add authorization tokens here, one per line
your-secret-token-1
your-secret-token-2
```

### Authentication Errors

- **401 Unauthorized**: Missing Authorization header
- **403 Forbidden**: Invalid authorization token

---

## Endpoints

### 1. Root Endpoint

Get API information and available endpoints.

**Endpoint**: `GET /`

**Authentication**: Not required

**Response**: `200 OK`

```json
{
  "message": "Moderation Cases API",
  "version": "1.0.0",
  "authentication": "Required - Use 'Authorization: Bearer YOUR_TOKEN' header",
  "endpoints": {
    "/cases": "Get all cases (with pagination)",
    "/cases/{case_id}": "Get case by ID",
    "/cases/user/{user_id}": "Get all cases for a user",
    "/cases/users": "Get all cases for multiple users",
    "/stats": "Get statistics"
  }
}
```

---

### 2. Get Statistics

Get statistics about moderation cases.

**Endpoint**: `GET /stats`

**Authentication**: Required

**Response**: `200 OK`

```json
{
  "total_cases": 1234,
  "unique_users": 567,
  "cases_by_type": {
    "ban": 450,
    "kick": 300,
    "mute": 234,
    "warn": 250
  }
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:8273/stats" \
  -H "Authorization: Bearer your-token-here"
```

---

### 3. Get All Cases

Get all cases with pagination and optional filtering.

**Endpoint**: `GET /cases`

**Authentication**: Required

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `skip` | integer | No | 0 | Number of cases to skip (for pagination) |
| `limit` | integer | No | 100 | Number of cases to return (max: 1000) |
| `type` | string | No | - | Filter by case type (ban, kick, mute, warn) |

**Response**: `200 OK`

```json
{
  "total": 1234,
  "skip": 0,
  "limit": 100,
  "cases": [
    {
      "id": "case-123",
      "userId": "user-456",
      "type": "ban",
      "reason": "Violation of rules",
      "authorId": "mod-789",
      "timestamp": "2025-10-13T10:30:00Z"
    }
  ]
}
```

**Example Requests:**

Get first 100 cases:
```bash
curl -X GET "http://localhost:8273/cases" \
  -H "Authorization: Bearer your-token-here"
```

Get cases 100-200:
```bash
curl -X GET "http://localhost:8273/cases?skip=100&limit=100" \
  -H "Authorization: Bearer your-token-here"
```

Get only ban cases:
```bash
curl -X GET "http://localhost:8273/cases?type=ban" \
  -H "Authorization: Bearer your-token-here"
```

---

### 4. Get Case by ID

Get a specific case by its ID.

**Endpoint**: `GET /cases/{case_id}`

**Authentication**: Required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `case_id` | string | Yes | The unique case identifier |

**Response**: `200 OK`

```json
{
  "id": "case-123",
  "userId": "user-456",
  "type": "ban",
  "reason": "Violation of rules",
  "authorId": "mod-789",
  "timestamp": "2025-10-13T10:30:00Z"
}
```

**Error Response**: `404 Not Found`

```json
{
  "detail": "Case case-123 not found"
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:8273/cases/case-123" \
  -H "Authorization: Bearer your-token-here"
```

---

### 5. Get Cases by User ID

Get all cases for a specific user.

**Endpoint**: `GET /cases/user/{user_id}`

**Authentication**: Required

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | The unique user identifier |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by case type (ban, kick, mute, warn) |

**Response**: `200 OK`

```json
{
  "user_id": "user-456",
  "total_cases": 3,
  "cases": [
    {
      "id": "case-123",
      "userId": "user-456",
      "type": "ban",
      "reason": "Violation of rules",
      "authorId": "mod-789",
      "timestamp": "2025-10-13T10:30:00Z"
    }
  ]
}
```

**Error Response**: `404 Not Found`

```json
{
  "detail": "No cases found for user user-456"
}
```

**Example Requests:**

Get all cases for a user:
```bash
curl -X GET "http://localhost:8273/cases/user/user-456" \
  -H "Authorization: Bearer your-token-here"
```

Get only warn cases for a user:
```bash
curl -X GET "http://localhost:8273/cases/user/user-456?type=warn" \
  -H "Authorization: Bearer your-token-here"
```

---

### 6. Get Cases by Multiple Users (POST)

Get all cases for multiple users in a single request.

**Endpoint**: `POST /cases/users`

**Authentication**: Required

**Request Body**:

```json
["user-123", "user-456", "user-789"]
```

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by case type (ban, kick, mute, warn) |

**Response**: `200 OK`

```json
{
  "user-123": {
    "total_cases": 2,
    "cases": [...]
  },
  "user-456": {
    "total_cases": 0,
    "cases": []
  },
  "user-789": {
    "total_cases": 5,
    "cases": [...]
  }
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:8273/cases/users" \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '["user-123", "user-456", "user-789"]'
```

With type filter:
```bash
curl -X POST "http://localhost:8273/cases/users?type=ban" \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '["user-123", "user-456"]'
```

---

### 7. Get Cases by Multiple Users (GET)

Get all cases for multiple users using a GET request with comma-separated IDs.

**Endpoint**: `GET /cases/users/batch`

**Authentication**: Required

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_ids` | string | Yes | Comma-separated list of user IDs |
| `type` | string | No | Filter by case type (ban, kick, mute, warn) |

**Response**: `200 OK`

```json
{
  "user-123": {
    "total_cases": 2,
    "cases": [...]
  },
  "user-456": {
    "total_cases": 0,
    "cases": []
  }
}
```

**Example Request:**
```bash
curl -X GET "http://localhost:8273/cases/users/batch?user_ids=user-123,user-456,user-789" \
  -H "Authorization: Bearer your-token-here"
```

With type filter:
```bash
curl -X GET "http://localhost:8273/cases/users/batch?user_ids=user-123,user-456&type=mute" \
  -H "Authorization: Bearer your-token-here"
```

---

### 8. Reload Data

Manually reload cases and auth tokens from their respective files.

**Endpoint**: `POST /reload`

**Authentication**: Required

**Response**: `200 OK`

```json
{
  "message": "Cases and auth tokens reloaded",
  "total_cases": 1234,
  "auth_tokens_loaded": 3
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:8273/reload" \
  -H "Authorization: Bearer your-token-here"
```

---

## Data Models

### Case Object

```json
{
  "id": "string",              // Unique case identifier
  "userId": "string",          // User ID who was moderated
  "type": "string",            // Case type: ban, kick, mute, warn
  "reason": "string",          // Reason for moderation
  "authorId": "string",        // Moderator/author who issued the case
  "timestamp": "string"        // ISO 8601 timestamp
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Authorization header required"
}
```

### 403 Forbidden
```json
{
  "detail": "Invalid authorization token"
}
```

### 404 Not Found
```json
{
  "detail": "Case case-123 not found"
}
```

Or:
```json
{
  "detail": "No cases found for user user-456"
}
```

### 422 Unprocessable Entity
Returned when query parameters are invalid (e.g., negative skip value, limit exceeds maximum).

```json
{
  "detail": [
    {
      "loc": ["query", "skip"],
      "msg": "ensure this value is greater than or equal to 0",
      "type": "value_error"
    }
  ]
}
```

---

## Features

### Auto-Reload

The API automatically monitors and reloads:
- **cases.json**: Checked every 2 seconds for changes
- **Auth.txt**: Checked every 2 seconds for changes

No restart required when updating data or auth tokens!

### Performance

The API uses in-memory indexes for fast lookups:
- Cases indexed by case ID for O(1) lookup
- Cases indexed by user ID for O(1) user queries
- All data cached in memory for minimal I/O

### Case Types

Supported moderation types:
- `ban`: Permanent or temporary bans
- `kick`: User removals from server
- `mute`: Temporary or permanent mutes
- `warn`: Warnings issued to users

---

## Setup and Configuration

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create `Auth.txt` with your tokens:
```
# Authorization tokens
your-secret-token-1
your-secret-token-2
```

3. Prepare your `cases.json` file with case data

### Running the Server

**Development:**
```bash
python api.py
```

**Production (with Uvicorn):**
```bash
uvicorn api:app --host 0.0.0.0 --port 8273
```

**Production (with auto-reload):**
```bash
uvicorn api:app --host 0.0.0.0 --port 8273 --reload
```

### Environment Variables

The server runs on port **8273** by default. To change:

```python
uvicorn.run(app, host="0.0.0.0", port=YOUR_PORT)
```

---

## Testing

### Health Check
```bash
curl http://localhost:8273/
```

### Test Authentication
```bash
# Should return 401
curl http://localhost:8273/stats

# Should return stats
curl -H "Authorization: Bearer your-token" http://localhost:8273/stats
```

### Test Case Retrieval
```bash
# Get all cases
curl -H "Authorization: Bearer your-token" http://localhost:8273/cases

# Get specific case
curl -H "Authorization: Bearer your-token" http://localhost:8273/cases/case-123

# Get user cases
curl -H "Authorization: Bearer your-token" http://localhost:8273/cases/user/user-456
```

---

## Rate Limiting

Currently, this API does not implement rate limiting. Consider adding rate limiting for production deployments using:
- FastAPI middleware
- Reverse proxy (e.g., nginx)
- API gateway

---

## CORS

CORS is not configured by default. To enable cross-origin requests, add:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Support

For issues or questions, please contact the API maintainer or refer to the FastAPI documentation at https://fastapi.tiangolo.com/
