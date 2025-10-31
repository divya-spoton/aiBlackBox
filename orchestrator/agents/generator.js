import OpenAI from 'openai';

export class GeneratorAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async generate(prompt, projectNamespace, firebaseConfig) {
        let enhancedPrompt = prompt;

        const systemPrompt = `You are an expert full-stack developer specializing in modern web applications with Firebase Firestore integration.

**FIREBASE FIRESTORE INTEGRATION:**
You have access to Firebase Firestore. Use it for ALL data persistence (don't use localStorage unless explicitly requested).

**Firebase Setup in Generated Code:**
The Firebase SDK and configuration will be auto-injected. You'll have access to:
- \`firebase\` global object (already initialized)
- \`db\` global object = firebase.firestore()
- \`PROJECT_NAMESPACE\` = the isolated path for this project

**CRITICAL: All collections MUST be under the project namespace:**
\`\`\`javascript
// CORRECT - Always use PROJECT_NAMESPACE
const todosRef = db.collection(\`\${PROJECT_NAMESPACE}/todos\`);

// WRONG - Never use root collections
const todosRef = db.collection('todos'); // ❌ DON'T DO THIS
\`\`\`

**Firestore Operations - Examples:**

**CREATE (Add Document):**
\`\`\`javascript
async function addTodo(text) {
    try {
        await db.collection(\`\${PROJECT_NAMESPACE}/todos\`).add({
            text: text,
            completed: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Todo added successfully");
        loadTodos(); // Refresh the list
    } catch (error) {
        console.error("Error adding todo:", error);
        alert("Failed to add todo");
    }
}
\`\`\`

**READ (Get All Documents):**
\`\`\`javascript
async function loadTodos() {
    try {
        const snapshot = await db.collection(\`\${PROJECT_NAMESPACE}/todos\`)
            .orderBy('createdAt', 'desc')
            .get();
        
        const todos = [];
        snapshot.forEach(doc => {
            todos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        renderTodos(todos);
    } catch (error) {
        console.error("Error loading todos:", error);
        alert("Failed to load todos");
    }
}
\`\`\`

**READ (Real-time Listener - Preferred):**
\`\`\`javascript
function listenToTodos() {
    db.collection(\`\${PROJECT_NAMESPACE}/todos\`)
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            const todos = [];
            snapshot.forEach(doc => {
                todos.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            renderTodos(todos);
        }, error => {
            console.error("Error listening to todos:", error);
        });
}
\`\`\`

**UPDATE (Modify Document):**
\`\`\`javascript
async function toggleTodo(id, currentStatus) {
    try {
        await db.collection(\`\${PROJECT_NAMESPACE}/todos\`)
            .doc(id)
            .update({
                completed: !currentStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log("Todo updated");
    } catch (error) {
        console.error("Error updating todo:", error);
        alert("Failed to update todo");
    }
}
\`\`\`

**DELETE (Remove Document):**
\`\`\`javascript
async function deleteTodo(id) {
    try {
        await db.collection(\`\${PROJECT_NAMESPACE}/todos\`)
            .doc(id)
            .delete();
        console.log("Todo deleted");
    } catch (error) {
        console.error("Error deleting todo:", error);
        alert("Failed to delete todo");
    }
}
\`\`\`

**QUERY with Filters:**
\`\`\`javascript
async function getCompletedTodos() {
    const snapshot = await db.collection(\`\${PROJECT_NAMESPACE}/todos\`)
        .where('completed', '==', true)
        .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
\`\`\`

**HOW TO DESIGN YOUR DATABASE:**

1. **Analyze the user prompt** to determine what collections are needed:
   - "Todo app" → \`todos\` collection
   - "Blog" → \`posts\`, \`comments\` collections  
   - "E-commerce" → \`products\`, \`cart\`, \`orders\` collections
   - "Note-taking app" → \`notes\`, \`folders\` collections

2. **Design appropriate fields** for each document:
   - Always include: \`createdAt\`, \`updatedAt\` (use FieldValue.serverTimestamp())
   - Add relevant fields based on app needs
   - Use proper data types: strings, numbers, booleans, arrays, timestamps
   
   Example for todos:
   \`\`\`javascript
   {
       text: "Buy groceries",           // string
       completed: false,                // boolean
       priority: "high",                // string
       tags: ["shopping", "urgent"],    // array
       dueDate: firebase.firestore.Timestamp.now(), // timestamp
       createdAt: firebase.firestore.FieldValue.serverTimestamp()
   }
   \`\`\`

3. **Write complete CRUD operations** based on app functionality:
   - **List view** → use .get() or .onSnapshot()
   - **Add button** → use .add()
   - **Edit button** → use .doc(id).update()
   - **Delete button** → use .doc(id).delete()
   - **Search/Filter** → use .where() queries

4. **Best Practices:**
   - Use real-time listeners (.onSnapshot()) for live updates
   - Always use try-catch for error handling
   - Add loading states during operations
   - Show user feedback (success/error messages)
   - Use .orderBy() to sort results
   - Call loadData() or use listeners on page load

5. **Complete Example - Todo App:**
\`\`\`javascript
// Global reference to the collection
const todosCollection = db.collection(\`\${PROJECT_NAMESPACE}/todos\`);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupRealtimeListener();
    setupEventListeners();
});

// Real-time listener for todos
function setupRealtimeListener() {
    todosCollection
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            const todosList = document.getElementById('todosList');
            todosList.innerHTML = '';
            
            snapshot.forEach(doc => {
                const todo = doc.data();
                const todoElement = createTodoElement(doc.id, todo);
                todosList.appendChild(todoElement);
            });
            
            updateStats(snapshot.size);
        });
}

// Add new todo
async function addTodo(text) {
    if (!text.trim()) return;
    
    try {
        await todosCollection.add({
            text: text.trim(),
            completed: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('todoInput').value = '';
        showNotification('Todo added!', 'success');
    } catch (error) {
        console.error('Error adding todo:', error);
        showNotification('Failed to add todo', 'error');
    }
}

// Toggle completion
async function toggleTodo(id, completed) {
    try {
        await todosCollection.doc(id).update({
            completed: !completed,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating todo:', error);
        showNotification('Failed to update todo', 'error');
    }
}

// Delete todo
async function deleteTodo(id) {
    if (!confirm('Delete this todo?')) return;
    
    try {
        await todosCollection.doc(id).delete();
        showNotification('Todo deleted', 'success');
    } catch (error) {
        console.error('Error deleting todo:', error);
        showNotification('Failed to delete todo', 'error');
    }
}
\`\`\`

**ARCHITECTURE & CODE QUALITY:**
- Use modern, clean code architecture
- Implement proper error handling for ALL database operations
- Add loading states during async operations
- Make it responsive (mobile, tablet, desktop)
- Use semantic HTML5
- Follow accessibility best practices
- Modern CSS (Flexbox/Grid)
- Smooth animations and transitions
- Professional, visually appealing design

**REQUIRED OUTPUT FORMAT:**
Return ONLY valid JSON (no markdown, no explanation):
{
  "files": [
    {"path": "index.html", "content": "...complete file..."},
    {"path": "styles.css", "content": "...complete styles..."},
    {"path": "app.js", "content": "...complete app with ALL database operations..."}
  ],
  "database": {
    "collections": [
      {
        "name": "todos",
        "fields": {
          "text": "string",
          "completed": "boolean",
          "createdAt": "timestamp",
          "updatedAt": "timestamp"
        },
        "indexes": ["createdAt"]
      }
    ]
  },
  "techStack": "HTML5, CSS3, JavaScript ES6+, Firebase Firestore",
  "description": "Brief description of what was built"
}

**CRITICAL:** 
- Generate COMPLETE, WORKING code
- Every feature must be fully implemented
- All database operations must be under \${PROJECT_NAMESPACE}/collections/
- Use real-time listeners when appropriate
- Add proper error handling and user feedback`;

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: enhancedPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4000,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);

        if (result.files && firebaseConfig) {
            result.files = this.injectFirebaseConfig(result.files, projectNamespace, firebaseConfig);
        }

        return result;
    }

    injectFirebaseConfig(files, projectNamespace, firebaseConfig) {
        return files.map(file => {
            if (file.path === 'index.html' || file.path.endsWith('.html')) {
                let content = file.content;

                // CHECK if Firebase is already injected - if yes, skip
                if (content.includes('firebase-app-compat.js')) {
                    return file; // Already injected, don't add again
                }

                const firebaseScripts = `
    <!-- Firebase SDK -->
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
    <script>
        // Firebase Configuration
        const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();
        const PROJECT_NAMESPACE = '${projectNamespace}';
    </script>
</body>`;
                content = content.replace('</body>', firebaseScripts);
                return { ...file, content };
            }
            return file;
        });
    }

    async fix(files, reviewIssues, testErrors, projectNamespace, firebaseConfig) {
        const systemPrompt = `You are debugging and fixing code issues. 

You will receive:
1. Current code files
2. Issues found in code review
3. Errors from testing

Fix ALL issues and return the COMPLETE updated code in the same JSON format:
{
  "files": [
    {"path": "index.html", "content": "..."},
    ...
  ],
  "techStack": "...",
  "description": "..."
}

Make sure the fixed code:
- Resolves all review issues
- Fixes all runtime errors
- Maintains functionality
- Is production-ready

Return ONLY the JSON, no markdown.`;

        const issuesSummary = reviewIssues.map(i => `- ${i.severity}: ${i.message}`).join('\n');
        const errorsSummary = testErrors ? testErrors.map(e => `- ${e}`).join('\n') : 'None';

        const userPrompt = `Current Files:
${JSON.stringify(files, null, 2)}

Review Issues:
${issuesSummary || 'None'}

Test Errors:
${errorsSummary}

Fix all issues and return the complete updated code.`;

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);

        // Re-inject Firebase config after fixes
        if (result.files && firebaseConfig) {
            result.files = this.injectFirebaseConfig(result.files, projectNamespace, firebaseConfig);
        }

        return result;
    }
}