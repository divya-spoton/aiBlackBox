import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GeneratorAgent } from './agents/generator.js';
import { ReviewAgent } from './agents/reviewer.js';
import { TestAgent } from './agents/test.js';
import { GitAgent } from './agents/git.js';
import { writeFiles, cleanWorkspace } from './utils/file.js';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseAgent } from './agents/database.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Store project state in memory (use DB in production)
const projects = new Map();

app.post('/api/create', async (req, res) => {
    const { prompt, projectId } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const id = projectId || Date.now().toString();

    projects.set(id, {
        id,
        status: 'generating',
        prompt,
        logs: [],
        iteration: 0
    });

    // Run async process
    buildProject(id, prompt).catch(err => {
        projects.get(id).status = 'failed';
        projects.get(id).error = err.message;
        console.error('Build failed:', err);
    });

    res.json({ projectId: id, status: 'started' });
});

app.post('/api/iterate/:id', async (req, res) => {
    const { changeRequest } = req.body;
    const project = projects.get(req.params.id);

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    if (project.status !== 'completed') {
        return res.status(400).json({ error: 'Project must be completed first' });
    }

    // Reset status for iteration
    project.status = 'iterating';
    project.logs.push({ timestamp: Date.now(), message: `\n--- New iteration: ${changeRequest} ---` });

    // Run iteration
    iterateProject(req.params.id, changeRequest).catch(err => {
        project.status = 'failed';
        project.error = err.message;
    });

    res.json({ projectId: req.params.id, status: 'iterating' });
});

app.get('/api/status/:id', (req, res) => {
    const project = projects.get(req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
});

app.post('/api/stop-preview/:id', async (req, res) => {
    const project = projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project._localStop) {
        await project._localStop();
        delete project._localStop;
        return res.json({ stopped: true });
    }
    res.json({ stopped: false, message: 'No local preview running' });
});



async function buildProject(projectId, prompt) {
    const project = projects.get(projectId);
    const MAX_ITERATIONS = 5;

    try {
        // Step 1: Provision Firebase namespace
        addLog(project, 'Setting up Firebase database...');
        const dbAgent = new DatabaseAgent();
        const dbInfo = await dbAgent.provisionDatabase(projectId);
        project.dbInfo = dbInfo;
        addLog(project, `Firebase ready. Namespace: ${dbInfo.namespace}`);

        // Step 2: Generate code - AI figures out collections and queries
        addLog(project, 'Generating code with database integration...');
        const generator = new GeneratorAgent();
        let generatedCode = await generator.generate(
            prompt,
            dbInfo.namespace,
            dbInfo.config
        );

        // Log what collections the AI decided to create
        if (generatedCode.database?.collections) {
            const collectionNames = generatedCode.database.collections.map(c => c.name).join(', ');
            addLog(project, `AI created collections: ${collectionNames}`);

            // Optional: Log collection schemas to backend
            for (const col of generatedCode.database.collections) {
                await dbAgent.logCollection(projectId, col.name, col.fields);
            }
        }

        // Write files to workspace
        const workspacePath = `./workspace/${projectId}`;
        await writeFiles(workspacePath, generatedCode.files);
        addLog(project, `Generated ${generatedCode.files.length} files`);



        // Step 3: Review & Test Loop with better logic
        // Step 3: Review & Test Loop
        const reviewer = new ReviewAgent();
        const tester = new TestAgent();
        let consecutiveFailures = 0; // Track if we're stuck

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            project.iteration = i + 1;
            addLog(project, `\n--- Iteration ${i + 1} ---`);

            // Review code
            addLog(project, 'Reviewing code...');
            const review = await reviewer.review(generatedCode.files);
            addLog(project, `Review: ${review.issues.length} issues found`);
            if (review.summary) {
                addLog(project, `Summary: ${review.summary}`);
            }

            // After review
            addLog(project, `Review: ${review.issues.length} issues found`);

            // ADD THIS - log the actual issues
            if (review.issues.length > 0 && review.issues.length <= 5) {
                review.issues.forEach(issue => {
                    addLog(project, `  [${issue.severity}] ${issue.file}: ${issue.message}`);
                });
            } else if (review.issues.length > 5) {
                addLog(project, `  (${criticalIssues.length} critical, ${importantIssues.length} important, ${review.issues.length - criticalOrImportant.length} minor)`);
            }

            // Test code
            addLog(project, 'Testing code...');
            const testResults = await tester.test(workspacePath);
            addLog(project, `Tests: ${testResults.passed ? 'PASSED' : 'FAILED'}`);

            // Log specific errors for debugging
            if (testResults.errors && testResults.errors.length > 0) {
                testResults.errors.forEach(err => addLog(project, `  - ${err}`));
            }

            // Classify issues by severity
            const criticalIssues = (review.issues || []).filter(it => it.severity === 'critical');
            const importantIssues = (review.issues || []).filter(it => it.severity === 'important');
            const criticalOrImportant = [...criticalIssues, ...importantIssues];

            // EXIT CONDITIONS:

            // 1. Perfect state: no critical/important issues AND tests pass
            if (criticalOrImportant.length === 0 && testResults.passed) {
                addLog(project, '✓ All critical/important issues resolved and tests passed!');
                break;
            }

            // 2. Good enough: only minor issues AND tests pass
            if (criticalIssues.length === 0 && importantIssues.length === 0 && testResults.passed) {
                addLog(project, '✓ Only minor issues remain, tests passed - proceeding.');
                break;
            }

            // 3. Stuck detection: same issues persisting for 2+ iterations
            if (criticalOrImportant.length > 0 && testResults.passed) {
                // Tests pass but still has issues - might be stuck on subjective things
                consecutiveFailures++;
                if (consecutiveFailures >= 2) {
                    addLog(project, '⚠ Review loop stuck - proceeding anyway (tests pass).');
                    break;
                }
            } else {
                consecutiveFailures = 0; // Reset counter if making progress
            }

            // 4. Max iterations reached
            if (i >= MAX_ITERATIONS - 1) {
                addLog(project, '⚠ Max iterations reached - proceeding with current version.');
                break;
            }

            // ATTEMPT FIX
            if (criticalOrImportant.length > 0 || !testResults.passed) {
                addLog(project, `Fixing ${criticalOrImportant.length} critical/important issues...`);

                try {
                    generatedCode = await generator.fix(
                        generatedCode.files,
                        criticalOrImportant,
                        testResults.errors,
                        dbInfo.namespace,
                        dbInfo.config
                    );
                    await writeFiles(workspacePath, generatedCode.files);
                    addLog(project, 'Applied fixes, re-checking...');
                } catch (fixError) {
                    addLog(project, `Fix attempt failed: ${fixError.message}`);
                    break; // Don't keep trying if fix itself errors
                }
            }
        }


        // Step 3: Git commit
        // addLog(project, 'Committing to Git...');
        // const git = new GitAgent();
        // const repoUrl = await git.commit(workspacePath, prompt);
        // project.repoUrl = repoUrl;
        // addLog(project, `Committed to: ${repoUrl}`);






        project.status = 'completed';
        addLog(project, '\n✓ Project completed successfully!');

    }
    catch (error) {
        project.status = 'failed';
        project.error = error.message;
        addLog(project, `✗ Error: ${error.message}`);
        throw error;
    }
}

async function iterateProject(projectId, changeRequest) {
    const project = projects.get(projectId);
    const workspacePath = `./workspace/${projectId}`;

    try {
        addLog(project, 'Reading existing files...');
        const { readFiles } = await import('./utils/file.js');
        const currentFiles = await readFiles(workspacePath);

        addLog(project, `Applying changes: ${changeRequest}`);
        const generator = new GeneratorAgent();

        // Create a prompt that includes context
        const iterationPrompt = `
Current application files:
${currentFiles.map(f => `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}

User requested change: ${changeRequest}

Update the application to incorporate this change. Return the COMPLETE updated files.
`;

        const updatedCode = await generator.generate(
            iterationPrompt,
            project.dbInfo.namespace,
            project.dbInfo.config
        );

        // Write updated files
        await writeFiles(workspacePath, updatedCode.files);
        addLog(project, 'Files updated');

        // Re-test
        const tester = new TestAgent();
        const testResults = await tester.test(workspacePath);

        if (!testResults.passed) {
            addLog(project, 'Tests failed, applying fixes...');
            const fixedCode = await generator.fix(
                updatedCode.files,
                [],
                testResults.errors,
                project.dbInfo.namespace,
                project.dbInfo.config
            );
            await writeFiles(workspacePath, fixedCode.files);
        }

        project.status = 'completed';
        addLog(project, '✓ Iteration completed');

    } catch (error) {
        project.status = 'failed';
        project.error = error.message;
        addLog(project, `✗ Iteration failed: ${error.message}`);
    }
}

function addLog(project, message) {
    project.logs.push({ timestamp: Date.now(), message });
    console.log(`[${project.id}] ${message}`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Orchestrator running on port ${PORT}`);
});