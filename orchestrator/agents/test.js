import { JSDOM } from 'jsdom';
import fs from 'fs/promises';
import path from 'path';

export class TestAgent {
    async test(workspacePath) {
        try {
            const errors = [];

            // Check if index.html exists
            const indexPath = path.join(workspacePath, 'index.html');
            const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);

            if (!indexExists) {
                errors.push('Missing index.html file');
                return { passed: false, errors };
            }

            // Read HTML file
            const htmlContent = await fs.readFile(indexPath, 'utf-8');

            // Test 1: Basic HTML validation
            if (!htmlContent.includes('<!DOCTYPE html>') && !htmlContent.includes('<!doctype html>')) {
                errors.push('Missing DOCTYPE declaration');
            }
            if (!htmlContent.includes('<html')) {
                errors.push('Missing <html> tag');
            }
            if (!htmlContent.includes('<head>') && !htmlContent.includes('<head ')) {
                errors.push('Missing <head> tag');
            }
            if (!htmlContent.includes('<body>') && !htmlContent.includes('<body ')) {
                errors.push('Missing <body> tag');
            }

            // Test 2: Run in JSDOM to catch JS errors
            try {
                const dom = new JSDOM(htmlContent, {
                    runScripts: 'dangerously',
                    resources: 'usable',
                    beforeParse(window) {
                        // Mock console to catch errors
                        window.console.error = (msg) => {
                            errors.push(`Console error: ${msg}`);
                        };
                    }
                });

                // Wait a bit for scripts to execute
                await new Promise(resolve => setTimeout(resolve, 500));

                // Check if there are any uncaught exceptions
                const scripts = dom.window.document.querySelectorAll('script');
                for (const script of scripts) {
                    if (script.src && !script.src.startsWith('http')) {
                        // Check if local script file exists
                        const scriptPath = path.join(workspacePath, script.src);
                        const scriptExists = await fs.access(scriptPath).then(() => true).catch(() => false);
                        if (!scriptExists) {
                            errors.push(`Referenced script not found: ${script.src}`);
                        }
                    }
                }

                // Check for CSS files
                const links = dom.window.document.querySelectorAll('link[rel="stylesheet"]');
                for (const link of links) {
                    if (link.href && !link.href.startsWith('http')) {
                        const cssPath = path.join(workspacePath, link.href);
                        const cssExists = await fs.access(cssPath).then(() => true).catch(() => false);
                        if (!cssExists) {
                            errors.push(`Referenced stylesheet not found: ${link.href}`);
                        }
                    }
                }

                dom.window.close();
            } catch (err) {
                errors.push(`JavaScript runtime error: ${err.message}`);
            }

            // Test 3: Check for common security issues
            if (htmlContent.includes('eval(')) {
                errors.push('Security risk: eval() usage detected');
            }
            if (htmlContent.includes('innerHTML') && !htmlContent.includes('DOMPurify')) {
                errors.push('Potential XSS risk: innerHTML usage without sanitization');
            }

            return {
                passed: errors.length === 0,
                errors
            };

        } catch (err) {
            return {
                passed: false,
                errors: [`Test execution failed: ${err.message}`]
            };
        }
    }
}