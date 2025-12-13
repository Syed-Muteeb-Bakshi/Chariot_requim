#!/usr/bin/env node

/**
 * VENTO AUREO - Demo Server
 * Simple HTTP server to serve mock data for offline testing
 * 
 * Usage:
 *   node demo-server.js [port]
 * 
 * Default port: 8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.argv[2] || 8080;
const FRONTEND_DIR = __dirname;
const MOCK_DIR = path.join(FRONTEND_DIR, 'payloads');

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let filePath = parsedUrl.pathname;

    // Default to index.html
    if (filePath === '/') {
        filePath = '/index.html';
    }

    // Remove leading slash
    filePath = filePath.substring(1);

    // Security: prevent directory traversal
    if (filePath.includes('..')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    // Full file path
    const fullPath = path.join(FRONTEND_DIR, filePath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Check if file exists
    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        // Read and serve file
        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }

            // Set CORS headers for API-like responses
            const headers = {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-api-key'
            };

            res.writeHead(200, headers);
            res.end(data);
        });
    });
});

server.listen(PORT, () => {
    console.log('✨ Vento Aureo Demo Server ✨');
    console.log(`Stand Power: Gold Experience`);
    console.log(`\nServer running at:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`\nServing files from: ${FRONTEND_DIR}`);
    console.log(`Mock data from: ${MOCK_DIR}`);
    console.log(`\nPress Ctrl+C to stop\n`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    server.close(() => {
        console.log('Server closed. Arrivederci! ✨');
        process.exit(0);
    });
});

