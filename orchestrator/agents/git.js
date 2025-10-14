import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export class GitAgent {
    async commit(workspacePath, commitMessage) {
        try {
            // Initialize git repo if not exists
            await execAsync('git init', { cwd: workspacePath });

            // Create .gitignore
            await fs.writeFile(
                path.join(workspacePath, '.gitignore'),
                'node_modules/\n.env\n.DS_Store\n'
            );

            // Add all files
            await execAsync('git add .', { cwd: workspacePath });

            // Commit
            const safeMessage = commitMessage.replace(/"/g, '\\"');
            await execAsync(`git commit -m "${safeMessage}"`, { cwd: workspacePath });

            // Optional: Push to GitHub
            // This requires GitHub token and pre-created repo
            if (process.env.GITHUB_TOKEN) {
                const repoName = `app-${Date.now()}`;
                await this.createGitHubRepo(repoName);

                const repoUrl = `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${repoName}.git`;
                await execAsync(`git remote add origin ${repoUrl}`, { cwd: workspacePath });
                await execAsync('git branch -M main', { cwd: workspacePath });
                await execAsync('git push -u origin main', { cwd: workspacePath });

                return `https://github.com/${process.env.GITHUB_USERNAME}/${repoName}`;
            }

            // If no GitHub token, return local path
            return `file://${workspacePath}`;

        } catch (err) {
            console.error('Git error:', err);
            throw new Error(`Failed to commit code: ${err.message}`);
        }
    }

    async createGitHubRepo(name) {
        // Use GitHub API to create repo
        const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                private: false,
                auto_init: false
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create GitHub repository');
        }

        return await response.json();
    }
}