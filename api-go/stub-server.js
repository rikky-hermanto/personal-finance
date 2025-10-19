// Simple Node.js health check server (alternative to Go)
// This allows testing the health endpoint without installing Go

import http from 'http';
import url from 'url';

const PORT = process.env.PF_SERVER_PORT || 7208;
const CORS_ORIGINS = process.env.PF_SERVER_CORS_ALLOWED_ORIGINS || 'http://localhost:8080';

// Health check response
function getHealthResponse() {
    return {
        status: "Healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0-nodejs-stub",
        service: "Personal Finance API (Node.js Stub)"
    };
}

// CORS headers
function setCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGINS);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Content-Type', 'application/json');
}

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const method = req.method;

    // Set CORS headers for all responses
    setCORSHeaders(res);

    // Handle preflight OPTIONS requests
    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Health check endpoint
    if (path === '/api/transactions/health' && method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(getHealthResponse(), null, 2));
        return;
    }

    // Root endpoint
    if (path === '/' && method === 'GET') {
        const rootResponse = {
            message: "Personal Finance API - Node.js Stub",
            note: "This is a temporary stub. Install Go to run the full API.",
            health: "/api/transactions/health",
            docs: "https://github.com/rikky-hermanto/personal-finance/blob/main/docs/Go-API-Implementation.md"
        };
        res.writeHead(200);
        res.end(JSON.stringify(rootResponse, null, 2));
        return;
    }

    // 404 for other endpoints
    res.writeHead(404);
    res.end(JSON.stringify({
        error: "Not Found",
        message: "This is a minimal stub. Install Go for full API functionality.",
        available_endpoints: ["/", "/api/transactions/health"]
    }, null, 2));
});

// Start server
server.listen(PORT, () => {
    console.log('🚀 Personal Finance API (Node.js Stub) starting...');
    console.log(`📍 Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/transactions/health`);
    console.log(`🔗 Root: http://localhost:${PORT}/`);
    console.log(`🌐 CORS enabled for: ${CORS_ORIGINS}`);
    console.log('');
    console.log('ℹ️  This is a temporary stub for testing.');
    console.log('   Install Go to run the full API implementation.');
    console.log('   See INSTALL-GO.md for installation instructions.');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});