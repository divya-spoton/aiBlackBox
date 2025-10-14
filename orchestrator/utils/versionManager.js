import fs from 'fs/promises';
import path from 'path';

export class VersionManager {
    constructor(projectId) {
        this.projectId = projectId;
        this.versionsPath = `./workspace/${projectId}/.versions`;
        this.manifestPath = path.join(this.versionsPath, 'manifest.json');
    }

    async initialize() {
        await fs.mkdir(this.versionsPath, { recursive: true });
        const manifestExists = await fs.access(this.manifestPath).then(() => true).catch(() => false);

        if (!manifestExists) {
            await this.saveManifest([]);
        }
    }

    async saveVersion(files, description) {
        const version = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            description,
            fileCount: files.length
        };

        // Save files for this version
        const versionDir = path.join(this.versionsPath, version.id);
        await fs.mkdir(versionDir, { recursive: true });

        for (const file of files) {
            const filePath = path.join(versionDir, file.path);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, file.content);
        }

        // Update manifest
        const manifest = await this.loadManifest();
        manifest.push(version);
        await this.saveManifest(manifest);

        return version.id;
    }

    async loadManifest() {
        try {
            const data = await fs.readFile(this.manifestPath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async saveManifest(manifest) {
        await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
    }

    async getVersions() {
        return this.loadManifest();
    }
}   