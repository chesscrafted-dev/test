# E2EE Chat Application - API Documentation

This document outlines the REST API routes and Socket.io events for the End-to-End Encrypted (E2EE) chat backend.

## 1. Authentication (REST API)

**Base URL:** `/api`

### Request OTP
Generates a 6-digit code and sends it via email.
*   **URL:** `/request-otp`
*   **Method:** `POST`
*   **Input:**
    ```json
    {
      "email": "user@example.com"
    }
    ```
*   **Success Response:**
    *   **Code:** 200
    *   **Content:** `{"message": "OTP sent"}`

### Verify OTP
Validates the OTP and returns a JWT for authentication.
*   **URL:** `/verify-otp`
*   **Method:** `POST`
*   **Input:**
    ```json
    {
      "email": "user@example.com",
      "otp": "123456"
    }
    ```
*   **Success Response:**
    *   **Code:** 200
    *   **Content:**
        ```json
        {
          "token": "JWT_STRING_HERE",
          "user_id": "8b2f..."
        }
        ```

---

## 2. Messages (REST API)

**Base URL:** `/api/messages`
**Auth Required:** `Authorization: Bearer <JWT>`

### Get Chat History
Fetches the encrypted message history for a specific DM.
*   **URL:** `/:chat_id`
*   **Method:** `GET`
*   **Success Response:**
    *   **Code:** 200
    *   **Content:**
        ```json
        [
          {
            "chat_id": "...",
            "sender_id": "...",
            "ciphertext": "...",
            "iv": "...",
            "auth_tag": "...",
            "timestamp": "2023-10-27T10:00:00Z"
          }
        ]
        ```

---

## 3. Real-time (Socket.io)

**Connection URL:** `http://localhost:5000`
**Authentication:** Pass the JWT in the `auth` object during connection.

### Connection Example
```javascript
const socket = io("http://localhost:5000", {
  auth: { token: "YOUR_JWT_TOKEN" }
});
```

### Client Emits (To Server)
| Event | Payload | Description |
| :--- | :--- | :--- |
| `join_chat` | `String` (chat_id) | Joins a specific chat room to receive live messages. |
| `send_message` | `Object` (Payload below) | Sends an encrypted message. |

**`send_message` Payload Format:**
```json
{
  "chat_id": "determined_by_frontend",
  "ciphertext": "encrypted_base64_string",
  "iv": "initialization_vector_hex",
  "auth_tag": "authentication_tag_hex"
}
```

### Client Listens (From Server)
| Event | Payload | Description |
| :--- | :--- | :--- |
| `receive_message`| `Object` (Payload below) | Triggered when a message is received in the joined chat. |

**`receive_message` Payload Format:**
```json
{
  "chat_id": "...",
  "sender_id": "...",
  "ciphertext": "...",
  "iv": "...",
  "auth_tag": "...",
  "timestamp": "..."
}
```

---

## 4. Frontend Utility: `chat_id` Generation

The frontend must generate the `chat_id` using the same deterministic logic as the backend to ensure consistency.

**Logic:**
1. Collect the `user_id` of User A and User B.
2. Sort them alphabetically: `[uid1, uid2].sort()`.
3. Join them with an underscore: `uid1_uid2`.
4. Hash the resulting string using **SHA-256**.
5. Use the hex-encoded hash as the `chat_id`.
