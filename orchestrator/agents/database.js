import admin from 'firebase-admin';

export class DatabaseAgent {
    constructor() {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID, 
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                })
            });
        }
        this.db = admin.firestore();
    }

    async provisionDatabase(projectId) {
        // Create a namespace for this project in Firestore
        const projectRef = this.db.collection('projects').doc(projectId);

        // Initialize project metadata
        await projectRef.set({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            collections: []
        });

        // Return Firebase config for frontend
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        };

        return {
            projectId,
            namespace: `projects/${projectId}`, // Firestore path prefix
            config: firebaseConfig
        };
    }

    async deleteProject(projectId) {
        // Delete all collections under this project
        const projectRef = this.db.collection('projects').doc(projectId);
        const collections = await projectRef.listCollections();

        for (const collection of collections) {
            const docs = await collection.listDocuments();
            for (const doc of docs) {
                await doc.delete();
            }
        }

        await projectRef.delete();
    }

    // Optional: Track what collections were created by AI
    async logCollection(projectId, collectionName, schema) {
        await this.db.collection('projects').doc(projectId).update({
            collections: admin.firestore.FieldValue.arrayUnion({
                name: collectionName,
                schema: schema,
                createdAt: new Date()
            })
        });
    }
}