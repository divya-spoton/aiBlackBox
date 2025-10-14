import OpenAI from 'openai';
import { FirebaseAgent } from './firebase.js';

export class GeneratorAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async generate(prompt, useFirebase = false) {
        let enhancedPrompt = prompt;
        if (useFirebase) {
            const firebaseAgent = new FirebaseAgent();
            enhancedPrompt = await firebaseAgent.enhancePromptWithFirebase(prompt, {});
        }
        const systemPrompt = `You are an expert full-stack developer specializing in modern web applications.

GENERATE A PRODUCTION-READY APPLICATION with these requirements:

**Architecture & Quality:**
- Use modern, clean code architecture
- Implement proper error handling and input validation
- Add loading states and user feedback
- Make it responsive (mobile, tablet, desktop)
- Use semantic HTML5
- Follow accessibility best practices (ARIA labels, keyboard navigation)

**Styling:**
- Use modern CSS (Flexbox/Grid)
- Implement a cohesive color scheme
- Add smooth animations and transitions
- Use proper typography hierarchy
- Make it visually appealing and professional
- Add hover states and focus indicators

**Functionality:**
- Implement complete, working features (no placeholders)
- Add proper form validation
- Handle edge cases (empty inputs, errors, etc.)
- Add keyboard shortcuts where appropriate
- Implement proper state management

**Code Structure:**
- Separate concerns (HTML structure, CSS styling, JS logic)
- Use meaningful variable/function names
- Add helpful comments for complex logic
- Keep functions small and focused
- Use modern ES6+ JavaScript

**REQUIRED OUTPUT FORMAT:**
Return ONLY valid JSON (no markdown, no explanation):
{
  "files": [
    {"path": "index.html", "content": "...complete file..."},
    {"path": "styles.css", "content": "...complete file..."},
    {"path": "app.js", "content": "...complete file..."}
  ],
  "techStack": "HTML5, CSS3, ES6+ JavaScript, [any CDN libraries used]",
  "description": "Brief description of what was built"
}

**CRITICAL:** Generate COMPLETE, WORKING code. Every feature must be fully implemented.`;

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

        // Add Firebase config file if needed
        if (useFirebase) {
            const firebaseAgent = new FirebaseAgent();
            const configFile = firebaseAgent.generateFirebaseConfig();
            result.files.push(configFile);
        }

        return result;
    }

    async fix(files, reviewIssues, testErrors) {
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
        return result;
    }
}