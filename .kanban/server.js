#!/usr/bin/env node
// Kanban board dev server — zero external dependencies
// Usage: node .kanban/server.js   (or: npm run kanban)

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE   = path.join(__dirname, 'tasks.db.json');
const HTML_FILE = path.join(__dirname, 'board.html');
const PORT      = process.env.KANBAN_PORT ?? 3001;

function readTasks() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeTasks(tasks) {
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  // GET /api/tasks
  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    send(res, 200, readTasks());
    return;
  }

  // PATCH /api/tasks/:id  — update any fields; null value removes the field
  if (req.method === 'PATCH' && url.pathname.startsWith('/api/tasks/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/tasks/'.length));
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        const tasks  = readTasks();
        const idx    = tasks.findIndex(t => t.id === id);
        if (idx === -1) { send(res, 404, { error: 'Task not found' }); return; }
        for (const [k, v] of Object.entries(update)) {
          if (v === null) delete tasks[idx][k];
          else tasks[idx][k] = v;
        }
        writeTasks(tasks);
        send(res, 200, tasks[idx]);
      } catch {
        send(res, 400, { error: 'Bad request' });
      }
    });
    return;
  }

  // GET /api/tasks/:id/markdown — serve raw .md file
  if (req.method === 'GET' && url.pathname.match(/^\/api\/tasks\/[^/]+\/markdown$/)) {
    const id = decodeURIComponent(url.pathname.slice('/api/tasks/'.length, -'/markdown'.length));
    const mdFile = path.join(__dirname, 'tasks', `${id}.md`);
    try {
      send(res, 200, fs.readFileSync(mdFile, 'utf-8'), 'text/plain; charset=utf-8');
    } catch {
      send(res, 404, `Markdown file not found for ${id}`, 'text/plain');
    }
    return;
  }

  // GET / or /board.html — serve the board
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/board.html')) {
    try {
      send(res, 200, fs.readFileSync(HTML_FILE, 'utf-8'), 'text/html; charset=utf-8');
    } catch {
      send(res, 500, 'Could not read board.html', 'text/plain');
    }
    return;
  }

  send(res, 404, 'Not found', 'text/plain');
});

server.listen(PORT, () => {
  console.log(`\nKanban board  →  http://localhost:${PORT}\n`);
});
