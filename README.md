# Blindspot - Anonymous University Community Platform

A single-file, mobile-first React application that functions as an anonymous community platform for university students, similar to a mix of Reddit and 4chan. Built with Firebase (Auth and Firestore) and designed to simulate a native Android experience in the browser.

## Features

### 🔐 Authentication & Anonymity
- **Firebase Anonymous Auth**: No emails, phone numbers, or passwords required
- **Tripcode System**: 5-character consistent identifier (e.g., !7F2A9) derived from anonymous UID
- **Access Gate**: Hardcoded community passcode protection
- **Burner Mode**: Quick logout to clear session and reset access

### 📋 Dual Modes
- **Boards**: Threaded discussion feed with board filtering (Random, Confessions, Faculty, Campus Life)
- **Live Wire**: Real-time, global, scrolling chat interface for ephemeral communication

### 🎨 Media Support
- **Image Upload**: Client-side compression to Base64/JPEG
- **Video Embeds**: Support for mp4 files and YouTube/Vimeo links
- **Media Display**: Works in both Board posts and Live Chat messages

### 🛡️ Security & OPSEC
- **Access Gate**: Community passcode required (default: `STUDENT2025`)
- **OPSEC Warning**: Persistent banner warning against University Wi-Fi usage
- **Network Safety**: Recommendations for Mobile Data/VPN usage

### 📱 UI/UX
- **Dark Theme**: Slate & Emerald color palette for hacker/cyber aesthetic
- **Mobile-First**: Optimized for mobile devices
- **Android Elements**: Floating Action Buttons (FAB), ripple effects, touch-friendly targets
- **Bottom Navigation**: Fixed navigation bar for easy mode switching

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable **Anonymous Authentication**:
   - Go to Authentication → Sign-in method
   - Enable "Anonymous" provider
3. Create a **Firestore Database**:
   - Go to Firestore Database
   - Create database in test mode (or set up security rules)
4. Get your Firebase configuration:
   - Go to Project Settings → General
   - Scroll to "Your apps" and copy the config object

### 3. Update Firebase Configuration

Open `src/App.tsx` and replace the Firebase configuration object (lines 8-14):

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 4. Configure Firestore Security Rules (Optional but Recommended)

In Firebase Console → Firestore Database → Rules, use:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anonymous users to read and write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Change Community Passcode (Optional)

In `src/App.tsx`, line 19, change the `COMMUNITY_PASSCODE` constant:

```typescript
const COMMUNITY_PASSCODE = 'YOUR_PASSCODE_HERE';
```

### 6. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in terminal).

### 7. Build for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

## Project Structure

```
Blindspot/
├── src/
│   ├── App.tsx          # Single-file application (all components)
│   ├── main.tsx         # React entry point
│   └── index.css        # Tailwind CSS imports
├── index.html           # HTML template
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── postcss.config.js    # PostCSS configuration
```

## Usage

1. **Access Gate**: Enter the community passcode to access the platform
2. **Boards Mode**: 
   - Browse posts filtered by board category
   - Tap the FAB (+) button to create a new post
   - Reply to posts to create threaded discussions
3. **Live Wire Mode**:
   - Real-time chat interface
   - Messages appear in chronological order
   - Auto-scrolls to latest messages
4. **Media Upload**:
   - Tap the camera icon to upload images (automatically compressed)
   - Paste video URLs to embed videos
5. **Burner Mode**: Tap "Burner Mode" button to logout and clear session

## Technical Details

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Auth + Firestore)
- **Image Compression**: Client-side Canvas API
- **Real-time Updates**: Firestore onSnapshot listeners
- **Video Support**: YouTube, Vimeo embeds + direct mp4/webm/ogg/mov files

## Security Considerations

⚠️ **Important**: This is a community platform designed for anonymous discussion. Users should:
- Use Mobile Data or VPN instead of University Wi-Fi
- Be aware that content is stored in Firebase (though anonymously)
- Understand that tripcodes are consistent per anonymous UID
- Use "Burner Mode" to clear sessions when needed

## License

This project is provided as-is for educational purposes.



