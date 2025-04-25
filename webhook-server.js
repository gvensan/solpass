const http = require('http');

// Configuration
const PORT = 8888; // Port to listen on

// Create the server
const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        let body = '';

        // Collect the data from the incoming request
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            // Log the request headers and body
            console.log('Received Webhook:');
            console.log('Headers:', req.headers);
            console.log('Body:', body);

            // Respond to the client (webhook sender)
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Webhook received successfully!');
        });
    } else {
        // Handle non-POST requests
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Only POST requests are allowed');
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`Webhook testing server is running on http://localhost:${PORT}`);
    console.log(`Send POST requests to this URL to test your webhooks.`);
});

// curl -X POST http://localhost:33333 -H "Content-Type: application/json" -d '{"username":"xyz","password":"xyz"}'

