import fs from 'fs/promises';
import path from 'path';

export async function writeFiles(workspacePath, files) {
    // Create workspace directory
    await fs.mkdir(workspacePath, { recursive: true });

    // Write each file
    for (const file of files) {
        const filePath = path.join(workspacePath, file.path);

        // Create directory if needed
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        // Write file
        await fs.writeFile(filePath, file.content, 'utf-8');
    }
}

export async function readFiles(workspacePath) {
    const files = [];

    async function readDir(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await readDir(fullPath);
                }
            } else {
                const relativePath = path.relative(workspacePath, fullPath);
                const content = await fs.readFile(fullPath, 'utf-8');
                files.push({ path: relativePath, content });
            }
        }
    }

    await readDir(workspacePath);
    return files;
}

export async function cleanWorkspace(workspacePath) {
    try {
        await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (err) {
        console.error('Failed to clean workspace:', err);
    }
}