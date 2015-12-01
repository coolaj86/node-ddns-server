Node.js DDNS API
======

**STOP:** You probably want [node-ddns](https://github.com/Daplie/node-ddns)

A Dynamic DNS (DDNS / DynDNS) API written in node.js.

This is one distinct part of a 3-part system.

  * node-ddns (full stack demo)
  * node-ddns-api (RESTful HTTP API)
  * node-ddns-frontend (HTML5 Management App)
  * node-ddns-service (UDP DNS Server)

Install & Configure
-------------------

```bash
# npm
npm install --save ddns-server

# git
git clone git@github.com:Daplie/node-ddns-server.git
```

```javascript
'use strict';

var ddnsServer = require('ddns-server');

function getAnswerList(questions, cb) {
  // questions -> [{ type: A|AAAA|CNAME|MX|TXT, name: 'example.com' }]
  cb(null, [{ type: 'A', address: '127.0.0.1', ttl: 600 }])
}

ddnsServer.create(port, address4, conf, getAnswerList).listen().then(function (closer) {
  console.log('listening');
  //closer.close();
});
```

Test
----

```bash
dig @localhost -p 5353 example.com
```


LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
