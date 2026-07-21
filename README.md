# SummAI — AI-Powered Text Summarizer Web Application

A full-stack web application that lets users sign up, log in, and generate and save summaries of text, with all user accounts and history stored in MongoDB.

## What it does

- Users can sign up and log in with email/password authentication.
- Signed-in users can submit text and generate a summary.
- Each summary is saved to the user's history, and can be viewed or deleted later.
- The backend exposes a small REST API; the frontend is built with vanilla HTML, CSS, and JavaScript.

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** MongoDB (via Mongoose ODM), hosted on MongoDB Atlas
- **Frontend:** HTML, CSS, vanilla JavaScript (fetch API for backend calls)
- **Auth:** Custom email/password authentication with client-side validation rules

## Project Structure

```
├── backend/
│   ├── server.js         # Express server, MongoDB models, and REST API routes
│   ├── package.json      # Backend dependencies
│   └── .env.example      # Template for your own MongoDB connection string
├── frontend/
│   ├── index.html        # Login / Signup page
│   ├── app.html          # Main application page
│   ├── app.js            # Core app logic (summarization, history)
│   ├── auth.js           # Login/signup form logic and validation
│   ├── db.js             # Frontend API client (calls the backend)
│   └── style.css         # Styling
└── .gitignore
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/signup` | Create a new user account |
| POST | `/api/login` | Authenticate a user |
| POST | `/api/history` | Save a summary to a user's history |
| GET | `/api/history/:userId` | Get a user's saved summaries |
| DELETE | `/api/history/:id` | Delete a saved summary |

## Running it locally

**1. Set up the backend:**
```
cd backend
npm install
```

**2. Add your MongoDB connection string:**
- Copy `.env.example` to a new file named `.env` in the `backend/` folder
- Replace the placeholder with your own MongoDB Atlas connection string (get this from your Atlas dashboard → Connect → Connect your application)
- In MongoDB Atlas, also make sure your IP is allowed under **Network Access**

**3. Start the backend server:**
```
node server.js
```
You should see `🚀 Server running at http://localhost:3000` and `✅ MongoDB Connected!`

**4. Open the frontend:**
Open `frontend/index.html` directly in your browser (double-click it, or drag it into Chrome/Edge). The frontend calls the backend at `http://localhost:3000`, so keep the backend server running.

## Notes

- Passwords are hashed with bcrypt before being stored, and are never returned in API responses.
- The MongoDB connection string is loaded from an environment variable (`.env`, not committed to the repo) rather than being hardcoded, to keep database credentials private.
- Future improvements: JWT-based sessions instead of client-side session storage, and deploying the backend so the app works without running a local server.
