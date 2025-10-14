import fs from 'fs/promises';
import path from 'path';

export class ContextManager {
    constructor(projectId, workspacePath) {
        this.projectId = projectId;
        this.workspacePath = workspacePath;
        this.fileTree = new Map();
    }

    async buildFileTree() {
        const files = await this.scanDirectory(this.workspacePath);
        files.forEach(file => {
            this.fileTree.set(file.path, {
                path: file.path,
                size: file.content.length,
                lastModified: Date.now()
            });
        });
    }

    async scanDirectory(dir) {
        const files = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                files.push(...await this.scanDirectory(fullPath));
            } else if (entry.isFile()) {
                const content = await fs.readFile(fullPath, 'utf-8');
                files.push({
                    path: path.relative(this.workspacePath, fullPath),
                    content
                });
            }
        }
        return files;
    }

    // Get only files relevant to a change request
    getRelevantFiles(changeDescription) {
        // Simple keyword matching for now
        // Later: use embeddings for semantic search
        const keywords = changeDescription.toLowerCase().split(' ');
        const relevant = [];

        for (const [filePath, info] of this.fileTree) {
            if (keywords.some(kw => filePath.toLowerCase().includes(kw))) {
                relevant.push(filePath);
            }
        }

        return relevant.length > 0 ? relevant : Array.from(this.fileTree.keys());
    }
}