import OpenAI from 'openai';

export class ReviewAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async review(files) {
        const systemPrompt = `You are a senior code reviewer. Review the provided code files for:

1. **Critical Issues**:
   - Security vulnerabilities (XSS, injection, etc.)
   - Logic errors that break functionality
   - Missing error handling
   - Syntax errors

2. **Important Issues**:
   - Poor code structure
   - Missing edge case handling
   - Accessibility issues
   - Performance problems

3. **Minor Issues**:
   - Code style inconsistencies
   - Missing comments for complex logic
   - Suboptimal practices

Return ONLY valid JSON in this format:
{
  "approved": true/false,
  "issues": [
    {
      "file": "index.html",
      "line": 42,
      "severity": "critical/important/minor",
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "summary": "Overall assessment"
}

Approve (set approved: true) ONLY if there are no critical or important issues.
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