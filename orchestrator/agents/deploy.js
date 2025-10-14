import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export class DeployAgent {
    async deploy(workspacePath) {
        try {
            // Create vercel.json config
            const vercelConfig = {
                version: 2,
                builds: [
                    {
                        src: 'index.html',
                        use: '@vercel/static'
                    }
                ]
            };

            await fs.writeFile(
                path.join(workspacePath, 'vercel.json'),
                JSON.stringify(vercelConfig, null, 2)
            );

            // Deploy using Vercel CLI
            // Make sure you run: npm i -g vercel && vercel login
            const { stdout } = await execAsync(
                'vercel --prod --yes',
                { cwd: workspacePath }
            );

            // Extract URL from output
            const urlMatch = stdout.match(/https:\/\/[^\s]+/);
            if (!urlMatch) {
                throw new Error('Could not extract deployment URL');
            }

            return urlMatch[0];

        } catch (err) {
            console.error('Deploy error:', err);

            // Fallback: Create a local preview URL
            // In production, you'd use a proper hosting service
            const projectId = path.basename(workspacePath);
            return `http://localhost:3000/preview/${projectId}`;
        }
    }

    // Alternative: Deploy to Netlify (simpler, no CLI needed)
    async deployToNetlify(workspacePath) {
        // Requires: npm install netlify
        const { NetlifyAPI } = await import('netlify');
        const client = new NetlifyAPI(process.env.NETLIFY_TOKEN);

        // Create a zip of the workspace
        const { stdout } = await execAsync(
            `cd ${workspacePath} && zip -r ../deploy.zip .`
        );

        // Deploy zip to Netlify
        const site = await client.createSiteDeploy({
            body: {
                name: `app-${Date.now()}`,
                zip: await fs.readFile(path.join(workspacePath, '../deploy.zip'))
            }
        });

        return site.ssl_url || site.url;
    }
}