import OpenAI from 'openai';

export class FirebaseAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    // Detect if user needs database
    async needsDatabase(prompt) {
        const detection = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{
                role: 'system',
                content: 'Determine if this app needs data persistence. Return JSON: {"needs": true/false, "reason": "why"}'
            }, {
                role: 'user',
                content: prompt
            }],
            response_format: { type: "json_object" }
        });

        return JSON.parse(detection.choices[0].message.content);
    }

    // Generate Firebase configuration files
    generateFirebaseConfig() {
        const firebaseConfig = {
            path: 'firebase-config.js',
            content: `// Firebase Configuration
// Get your config from: https://console.firebase.google.com/
const firebaseConfig = {
    apiKey: "${process.env.FIREBASE_API_KEY || 'YOUR_API_KEY'}",
    authDomain: "${process.env.FIREBASE_AUTH_DOMAIN || 'your-app.firebaseapp.com'}",
    projectId: "${process.env.FIREBASE_PROJECT_ID || 'your-project-id'}",
    storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET || 'your-app.appspot.com'}",
    messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID'}",
    appId: "${process.env.FIREBASE_APP_ID || 'YOUR_APP_ID'}"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

console.log('✓ Firebase initialized');
`
        };

        return firebaseConfig;
    }

    // Enhance user prompt with Firebase instructions
    async enhancePromptWithFirebase(originalPrompt, dataNeeds) {
        const enhancedPrompt = `${originalPrompt}

**IMPORTANT - USE FIREBASE FOR DATA:**
This app needs data persistence. Implement using Firebase Firestore:

1. Include Firebase CDN in HTML:
   <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
   <script src="firebase-config.js"></script>

2. Store data in Firestore collections:
   - Use meaningful collection names (e.g., 'tasks', 'users', 'posts')
   - Structure data properly with document IDs
   - Use subcollections for nested data if needed

3. Implement CRUD operations:
   \`\`\`javascript
   // CREATE
   await db.collection('items').add({ name: 'Example', createdAt: new Date() });
   
   // READ (real-time listener)
   db.collection('items').onSnapshot(snapshot => {
       snapshot.forEach(doc => {
           const data = doc.data();
           // Update UI with data
       });
   });
   
   // UPDATE
   await db.collection('items').doc(docId).update({ name: 'Updated' });
   
   // DELETE
   await db.collection('items').doc(docId).delete();
   \`\`\`

4. Add loading states while data is fetching
5. Handle errors (network issues, permission denied, etc.)
6. Show real-time updates when data changes

Generate COMPLETE working code with Firebase integration.`;

        return enhancedPrompt;
    }

    // Generate instructions for user to set up Firebase
    getSetupInstructions(projectId) {
        return {
            title: "Firebase Setup Required",
            steps: [
                "1. Go to https://console.firebase.google.com/",
                "2. Create a new project (or use existing)",
                "3. Enable Firestore Database (Start in test mode for development)",
                "4. Get your config from Project Settings > General > Your apps",
                "5. Copy your config values to orchestrator/.env:",
                "   FIREBASE_API_KEY=your_key",
                "   FIREBASE_AUTH_DOMAIN=your_domain",
                "   FIREBASE_PROJECT_ID=your_project_id",
                "   FIREBASE_STORAGE_BUCKET=your_bucket",
                "   FIREBASE_MESSAGING_SENDER_ID=your_id",
                "   FIREBASE_APP_ID=your_app_id",
                "6. Firestore Security Rules (for development):",
                "   rules_version = '2';",
                "   service cloud.firestore {",
                "     match /databases/{database}/documents {",
                "       match /{document=**} {",
                "         allow read, write: if true; // CHANGE THIS IN PRODUCTION!",
                "       }",
                "     }",
                "   }",
                "",
                `Your app will use Firebase project: ${projectId}`
            ]
        };
    }
}