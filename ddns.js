'use strict';

module.exports.create = function (ndns, conf, store) {
  // TODO move promise to dependencies
  var PromiseA = require('bluebird');

  if (!conf || !conf.primaryNameserver) {
    throw new Error("You must supply options, at least { primaryNamserver: 'ns1.example.com' }");
  }

  function setLocalhost(request, response, value) {
    var type = ndns.consts.QTYPE_TO_NAME[request.question[0].type];
    var name = request.question[0].name;
    var priority = 10;
    //var klass = ndns.consts.QCLASS_TO_NAME[request.question[0].class];

    response.answer.push(
      ndns[type]({
        name: name
      , address: value
      , ttl: 43200 // 12 hours
      , data: [value]
      , exchange: value
      , priority: priority || 10
      })
    );
  }

  function getSoa(conf, store, request) {
    var name = request.question[0].name;
    var soa = {
      "name": name,
      "ttl": "7200",
      "primary": conf.primaryNameserver,
      "admin": "hostmaster." + name,
      // YYYYmmddss
      // http://mxtoolbox.com/problem/dns/DNS-SOA-Serial-Number-Format
      "serial": "2015062300",
      "refresh": "10800",
      "retry": "3600",
      // 14 days
      // http://mxtoolbox.com/problem/dns/DNS-SOA-Expire-Value
      "expiration": "1209600",
      "minimum": "1800"
    };

    return soa;
  }

  function handleAny(ndns, conf, store, request, response) {
    store.getAnswerList(request && request.question.map(function (q) {
      // TODO give the bits is well (for convenience)
      return {
        name: q.name
      , type: ndns.consts.QTYPE_TO_NAME[q.type]
      , class: ndns.consts.QCLASS_TO_NAME[q.class]
      };
        // TODO promise?
    }), function (err, zone) {
      if (err) {
        throw err;
      }

      var matches = [];

      // TODO ANAME for when we want to use a CNAME with a root (such as 'example.com')
      zone.forEach(function (a) {
        if ('*' === a.name[0]) {
          // *.example.com => .example.com (valid)
          // *example.com => example.com (invalid, but still safe)
          // TODO clone a
          a.name = a.name.slice(1);
        }
        request.question.forEach(function (q) {
          var qtype = ndns.consts.QTYPE_TO_NAME[q.type];
          if (a.name === q.name) {
            if (a.type === qtype) {
              matches.push(a);
            }
            else if ((-1 !== ['A', 'AAAA'].indexOf(qtype)) && 'ANAME' === a.type) {
              a.realtype = qtype;
              matches.push(a);
            }
          }
          else if ('.' === a.name[0] && (q.name.length > a.name.length)) {
            if (a.name === q.name.slice(q.name.length - a.name.length)) {
              if (a.type === qtype) {
                // TODO clone a
                a.name = q.name;
                matches.push(a);
              }
              else if ((-1 !== ['A', 'AAAA'].indexOf(qtype)) && 'ANAME' === a.type) {
                // TODO clone a
                a.name = q.name;
                a.realtype = qtype;
                matches.push(a);
              }
            }
          }
        });
      });

      return PromiseA.all(matches.map(function (a) {
        // TODO why have values as array? just old code I think (for TXT?)
        if ((a.value || a.answer) && !a.values) {
          a.values = [a.value || a.answer];
        }

        var result = {
          name: a.name
        , address: a.address || a.values[0]
        , data: a.data || a.values
        , exchange: a.exchange || a.values[0]
        , priority: a.priority || 10
        , ttl: a.ttl || 600
        };

        if ('CNAME' === a.type && Array.isArray(result.data)) {
          result.data = result.data[0];
        }
        // I think the TXT record requires an array
        if ('TXT' === a.type && !Array.isArray(result.data)) {
          result.data = [result.data];
        }

        return ndns[a.type](result);
      })).then(function (answers) {
        response.answer = answers.filter(function (a) {
          return a;
        });
        response.send();
      });
    });
  }

  var handlers = {
    SOA: function (ndns, conf, store, request, response) {
      // See example of
      // dig soa google.com @ns1.google.com

      // TODO auto-increment serial number as epoch timestamp (in seconds) of last record update for that domain
      if (false && /^ns\d\./.test(name)) {
        /*
        soa.ttl = 60;

        response.authority.push(ndns.NS({
          name: request.question[0].name
        , data: ns.name
        , ttl: 60 * 60
        }));
        */
      } else {
        response.answer.push(ndns.SOA(getSoa(conf, store, request)));

        conf.nameservers.forEach(function (ns) {
          response.authority.push(ndns.NS({
            name: request.question[0].name
          , data: ns.name
          , ttl: 60 * 60
          }));

          response.additional.push(ndns.A({
            name: ns.name
          , address: ns.ipv4
          , ttl: 60 * 60
          }));
        });

        response.send();
      }
    }
  , NAPTR: function (ndns, conf, store, request, response) {
      // See example of
      // dig naptr google.com @ns1.google.com

      response.authority.push(ndns.SOA(getSoa(conf, store, request)));
      /*
      response.authority.push(ndns.NAPTR({
        "flags": "aa qr rd"
      }));
      */
      response.send();
      return;
    }
  , NS: function (ndns, conf, store, request, response) {
      if ('NS' === ndns.consts.QTYPE_TO_NAME[request && request.question[0].type]) {

        // See example of
        // dig ns google.com @ns1.google.com

        //console.log(Object.keys(response));
        //console.log('response.header');
        //console.log(response.header);
        //console.log('response.authority');
        //console.log(response.authority);

        conf.nameservers.forEach(function (ns) {
          response.answer.push(ndns.NS({
            name: request.question[0].name
          , data: ns.name
          , ttl: 60 * 60
          }));
          response.additional.push(ndns.A({
            name: ns.name
          , address: ns.ipv4
          , ttl: 60 * 60
          }));
        });

        response.send();
        return;
      }
    }
  , A: function (ndns, conf, store, request, response) {
      if (/^local(host)?\./.test(request.question[0].name)) {
        setLocalhost(request, response, '127.0.0.1');
        response.send();
        return;
      }

      handleAny(ndns, conf, store, request, response);
    }
  , AAAA: function (ndns, conf, store, request, response) {
      if (/^local(host)?\./.test(request.question[0].name)) {
        setLocalhost(request, response, '::1');
        response.send();
        return;
      }

      handleAny(ndns, conf, store, request, response);
    }
  , CNAME: handleAny
  , MX: handleAny
  , SRV: handleAny
  , TXT: handleAny
  , any: handleAny
  };

  return function (request, response) {
    var typename = ndns.consts.QTYPE_TO_NAME[request && request.question[0].type];
    //console.log('\n\n');
    //console.log('request', request.question);
    //console.log('type', ndns.consts.QTYPE_TO_NAME[request.question[0].type]);
    //console.log('class',ndns.consts.QCLASS_TO_NAME[request.question[0].class]);

    // This is THE authority
    response.header.aa = 1;

    if (!handlers[typename]) {
      typename = 'any';
    }

    handlers[typename](ndns, conf, store, request, response);
  };
};
