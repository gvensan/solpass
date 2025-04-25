var http = require('http');

var RC_PORT = 9090;
//var RC_HOST = '127.0.0.1';     // only works from browser, not RDP
//var RC_HOST = '10.1.1.245';    // home
var RC_HOST = '172.19.118.148';  // office LAN
// var RC_HOST = 'localhost';x

const msg = {};
const resetMsg = () => {
  msg.method = '';
  msg.url = '';
  msg.time = '';
  msg.header = {};
  msg.body = {};
}

http.createServer(function (req, res) {
    resetMsg();
    let date_ob = new Date();
    var dateStr = date_ob.getHours()+':'+date_ob.getMinutes()+':'+date_ob.getSeconds();
    msg.method = req.method;
    msg.url = req.url;
    msg.time = dateStr;

    Object.keys(req.headers).forEach(function(key) {
        var val = req.headers[key];
        msg.header[key] = val;
    });
    let body = [];
    req.on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        body = Buffer.concat(body).toString();
        msg.body = JSON.parse(body);
        console.log('Received new message @ ' + dateStr);
        console.log(JSON.stringify(msg, null, 2));
    });

    // RESPONSE TIME!
    //res.writeHead(200);  // bytes message
    res.writeHead(200, { 'Content-Type': 'text/plain' });  // text message
    res.write("Hello from Mock HTTP server!");
    res.end();
    //console.log(res);
}).listen(RC_PORT,RC_HOST);

// good to go!
console.log('Server running at http://'+RC_HOST+':'+RC_PORT+'/');
