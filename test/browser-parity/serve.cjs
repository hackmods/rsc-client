const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const browserify = require('browserify');

const clientRoot = path.resolve(__dirname, '..', '..');
const entry = path.join(__dirname, 'fixture-entry.js');
const port = Number(process.env.ARSC_FIXTURE_PORT || 4173);

const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');

    if (pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('ok');
        return;
    }

    if (pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(path.join(__dirname, 'fixture.html')).pipe(response);
        return;
    }

    if (pathname === '/fixture.js') {
        response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        browserify(entry, { basedir: clientRoot }).bundle().on('error', (error) => {
            response.destroy(error);
            console.error(error);
        }).pipe(response);
        return;
    }

    if (pathname === '/data204/fonts1.jag') {
        const fontArchive = path.join(clientRoot, 'dist', 'data204', 'fonts1.jag');
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(fontArchive).pipe(response);
        return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
});

server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`bank fixture listening at http://127.0.0.1:${port}/\n`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
