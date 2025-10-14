// orchestrator/agents/deploy_local.js
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import url from 'url';

function contentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'application/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.svg': return 'image/svg+xml';
        case '.ico': return 'image/x-icon';
        case '.txt': return 'text/plain; charset=utf-8';
        default: return 'application/octet-stream';
    }
}

export class LocalDeployAgent {
    constructor() {
        // map from workspacePath -> server info
        this.servers = new Map();
    }

    async serve(workspacePath, host = '127.0.0.1', preferredPort = 0) {
        // If already serving this workspace, return existing URL
        if (this.servers.has(workspacePath)) {
            return this.servers.get(workspacePath).url;
        }

        const server = http.createServer(async (req, res) => {
            try {
                const parsed = url.parse(req.url || '/');
                let reqPath = decodeURIComponent(parsed.pathname || '/');

                // Normalize path
                if (reqPath === '/') reqPath = '/index.html';

                // Prevent path traversal
                const safePath = path.normalize(path.join(workspacePath, reqPath));
                if (!safePath.startsWith(path.normalize(workspacePath))) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                // If file exists serve it, otherwise serve index.html (SPA fallback)
                const exists = await fs.access(safePath).then(() => true).catch(() => false);
                let fileToServe = safePath;
                if (!exists) {
                    const fallback = path.join(workspacePath, 'index.html');
                    const fallbackExists = await fs.access(fallback).then(() => true).catch(() => false);
                    if (fallbackExists) fileToServe = fallback;
                    else {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }
                }

                const data = await fs.readFile(fileToServe);
                res.writeHead(200, { 'Content-Type': contentType(fileToServe) });
                res.end(data);
            } catch (err) {
                res.writeHead(500);
                res.end('Server error: ' + err.message);
            }
        });

        // Listen on preferredPort (0 for random)
        await new Promise((resolve, reject) => {
            server.listen(preferredPort, host)
                .once('listening', resolve)
                .once('error', reject);
        });

        const address = server.address();
        const port = typeof address === 'object' ? address.port : address;
        const urlStr = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`;

        // Save server so we can stop it later
        this.servers.set(workspacePath, { server, url: urlStr });

        // Helpful shutdown hook
        const stop = async () => {
            return new Promise((resolve) => {
                server.close(() => {
                    this.servers.delete(workspacePath);
                    resolve();
                });
            });
        };

        // Expose stop on the returned object as well
        return { url: urlStr, stop };
    }

    async stop(workspacePath) {
        const info = this.servers.get(workspacePath);
        if (!info) return;
        await new Promise((resolve) => info.server.close(resolve));
        this.servers.delete(workspacePath);
    }
}
