import OpenAI from 'openai';

export class ReviewAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async review(files) {
        const systemPrompt = `You are a senior code reviewer. Review the provided code files for:

**Classification Guidelines:**

1. **Critical Issues** (Must fix - breaks functionality):
   - Security vulnerabilities (XSS, SQL injection, exposed credentials)
   - Logic errors that prevent core features from working
   - Missing error handling that causes crashes
   - Syntax errors that prevent code execution
   - Database: Using root collections instead of PROJECT_NAMESPACE
   - Database: Collection paths with wrong segment count

2. **Important Issues** (Should fix - degrades experience):
   - Poor error handling for edge cases
   - Accessibility violations (missing alt text, ARIA labels)
   - Performance problems (memory leaks, infinite loops)
   - Database: Missing real-time listeners where beneficial
   - Database: Not using FieldValue.serverTimestamp()

3. **Minor Issues** (Nice to have - style/best practices):
   - Code style inconsistencies
   - Missing comments
   - Variable naming
   - Redundant code
   - Minor optimizations

**IMPORTANT RULES:**
- **Be pragmatic**: If the code works and has no security issues, don't fail it over style.
- **Approve liberally**: Set \`approved: true\` if there are NO critical issues and <= 2 important issues.
- **Focus on functionality**: Working code > perfect code.
- **Database paths**: Flag as CRITICAL if collections don't use \`\${PROJECT_NAMESPACE}/collectionName\` format.

Return ONLY valid JSON:
{
  "approved": true/false,
  "issues": [
    {
      "file": "index.html",
      "line": 42,
      "severity": "critical",
      "message": "Brief description",
      "suggestion": "How to fix"
    }
  ],
  "summary": "Overall assessment (1-2 sentences)"
}

Return ONLY the JSON, no markdown.`;

        const filesContent = files.map(f =>
            `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
        ).join('\n\n');

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: filesContent }
            ],
            temperature: 0.2,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        return result;
    }
}