import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GeneratorAgent } from './agents/generator.js';
import { ReviewAgent } from './agents/reviewer.js';
import { TestAgent } from './agents/test.js';
import { DeployAgent } from './agents/deploy.js';
import { GitAgent } from './agents/git.js';
import { writeFiles, cleanWorkspace } from './utils/file.js';
import { LocalDeployAgent } from './agents/deploy_local.js';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { VersionManager } from './utils/versionManager.js';
import { FirebaseAgent } from './agents/firebase.js';


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

app.get('/api/versions/:id', async (req, res) => {
    const project = projects.get(req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    const versionManager = new VersionManager(req.params.id);
    const versions = await versionManager.getVersions();
    res.json({ versions });
});

async function buildProject(projectId, prompt) {
    const project = projects.get(projectId);
    const MAX_ITERATIONS = 5;

    try {
        // Step 1: Generate initial code
        addLog(project, 'Generating initial code...');
        
        const firebaseAgent = new FirebaseAgent();
        const dbCheck = await firebaseAgent.needsDatabase(prompt);
        const useFirebase = dbCheck.needs;

        if (useFirebase) {
            addLog(project, `Database needed: ${dbCheck.reason}`);
            addLog(project, 'Configuring Firebase integration...');

            // Show setup instructions
            const instructions = firebaseAgent.getSetupInstructions(projectId);
            project.firebaseSetup = instructions;
            addLog(project, '⚠️  Firebase setup required (see firebaseSetup in status)');
        }

        const generator = new GeneratorAgent();
        let generatedCode = await generator.generate(prompt, useFirebase);
        console.log('Generated files:', generatedCode.files.map(f => f.path));

        //     // Write files to workspace
        const workspacePath = `./workspace/${projectId}`;
        await writeFiles(workspacePath, generatedCode.files);
        addLog(project, `Generated ${generatedCode.files.length} files`);

        // Save version
        const versionManager = new VersionManager(projectId);
        await versionManager.initialize();
        await versionManager.saveVersion(generatedCode.files, 'Initial generation');
        addLog(project, 'Version saved');

        // Step 2: Review & Test Loop
        const reviewer = new ReviewAgent();
        const tester = new TestAgent();

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            project.iteration = i + 1;
            addLog(project, `\n--- Iteration ${i + 1} ---`);

            // Review code
            addLog(project, 'Reviewing code...');
            const review = await reviewer.review(generatedCode.files);
            addLog(project, `Review: ${review.issues.length} issues found`);
            addLog(project, `Summary: ${review.summary || ''}`);

            // Test code
            addLog(project, 'Testing code...');
            const testResults = await tester.test(workspacePath);
            addLog(project, `Tests: ${testResults.passed ? 'PASSED' : 'FAILED'}`);

            // Classify issues by severity
            const criticalOrImportant = (review.issues || []).filter(
                it => it.severity === 'critical' || it.severity === 'important'
            );
            const minorOnly = (review.issues || []).length > 0 && criticalOrImportant.length === 0;

            // If no critical/important issues and tests pass -> success
            if (criticalOrImportant.length === 0 && testResults.passed) {
                addLog(project, '✓ No critical/important issues and tests passed — finishing loop.');
                // Mark approved if the LLM didn't already
                review.approved = true;
                break;
            }

            // If only minor issues (and tests passed), proceed without more fix iterations
            if (minorOnly && testResults.passed) {
                addLog(project, 'Only minor issues remain and tests passed — proceeding without further fixes.');
                break;
            }

            // If there are critical/important issues and we still have iterations left, request fixes
            if (criticalOrImportant.length > 0 && i < MAX_ITERATIONS - 1) {
                addLog(project, `Generating fixes for ${criticalOrImportant.length} critical/important issues...`);
                // Only pass the critical/important issues to generator.fix so it ignores minor formatting/style suggestions
                generatedCode = await generator.fix(
                    generatedCode.files,
                    criticalOrImportant,
                    testResults.errors
                );
                // Re-write files and continue
                await writeFiles(workspacePath, generatedCode.files);
                addLog(project, `Wrote fixed files (iteration ${i + 1})`);
                // continue to next iteration
                continue;
            }

            // If we've reached here it means either max iterations or only issues that won't be fixed automatically
            addLog(project, 'Reached iteration limit or no auto-fixable issues remain. Proceeding to commit/deploy.');
            break;
        }


        // Step 3: Git commit
        // addLog(project, 'Committing to Git...');
        // const git = new GitAgent();
        // const repoUrl = await git.commit(workspacePath, prompt);
        // project.repoUrl = repoUrl;
        // addLog(project, `Committed to: ${repoUrl}`);

        // Step 4: Deploy (choose local preview when USE_LOCAL_PREVIEW=true)
        addLog(project, 'Deploying...');

        let deployUrl = null;

        try {
            if (process.env.USE_LOCAL_PREVIEW === 'true') {
                addLog(project, 'Starting local preview server...');
                const localDeployer = new LocalDeployAgent();
                const res = await localDeployer.serve(path.resolve(workspacePath));
                // res is { url, stop } — older implementation may return just url; handle both
                if (res && typeof res === 'object' && res.url) {
                    project.previewUrl = res.url;
                    // save stop function so we can stop later if needed
                    project._localStop = res.stop || null;
                    deployUrl = res.url;
                } else {
                    // fallback if serve returned a string URL
                    project.previewUrl = res;
                    deployUrl = res;
                }
            } else {
                // Cloud deploy path
                const deployer = new DeployAgent();
                deployUrl = await deployer.deploy(workspacePath);
                project.deployUrl = deployUrl;
            }

            project.deployUrl = deployUrl;
            addLog(project, `Deployed to: ${deployUrl}`);
        } catch (err) {
            addLog(project, `✗ Error during deploy: ${err.message}`);
            // If deploy failed, still continue to set status and error
            project.status = 'failed';
            project.error = err.message;
            throw err;
        }



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

        const updatedCode = await generator.generate(iterationPrompt);

        // Write updated files
        await writeFiles(workspacePath, updatedCode.files);
        addLog(project, 'Files updated');

        // Re-test
        const tester = new TestAgent();
        const testResults = await tester.test(workspacePath);

        if (!testResults.passed) {
            addLog(project, 'Tests failed, applying fixes...');
            const fixedCode = await generator.fix(updatedCode.files, [], testResults.errors);
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