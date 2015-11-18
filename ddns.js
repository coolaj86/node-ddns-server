'use strict';

module.exports.create = function (ndns, conf, store) {
  if (!conf || !conf.primaryNameserver) {
    throw new Error("You must supply options, at least { primaryNamserver: 'ns1.example.com' }");
  }

  return function (request, response) {
    //console.log('\n\n');
    //console.log('request', request.question);
    //console.log('type', ndns.consts.QTYPE_TO_NAME[request.question[0].type]);
    //console.log('class',ndns.consts.QCLASS_TO_NAME[request.question[0].class]);

    // This is THE authority
    response.header.aa = 1;

    function getSOA() {
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

    if ('SOA' === ndns.consts.QTYPE_TO_NAME[request && request.question[0].type]) {
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
        response.answer.push(ndns.SOA(getSOA()));

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
      return;
    }

    if ('NAPTR' === ndns.consts.QTYPE_TO_NAME[request && request.question[0].type]) {

      // See example of
      // dig naptr google.com @ns1.google.com

      response.authority.push(ndns.SOA(getSOA()));
      /*
      response.authority.push(ndns.NAPTR({
        "flags": "aa qr rd"
      }));
      */
      response.send();
      return;
    }

    if ('NS' === ndns.consts.QTYPE_TO_NAME[request && request.question[0].type]) {

      // See example of
      // dig ns google.com @ns1.google.com

      //console.log(Object.keys(response));
      //console.log('response.header');
      //console.log(response.header);
      //console.log('response.authority');
      //console.log(response.authority);

      response.header.aa = 1;

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

    if ('A' === ndns.consts.QTYPE_TO_NAME[request && request.question[0].type]) {
      if (/^local(host)?\./.test(request.question[0].name)) {
        response.header.aa = 1;

        (function () {
          var type = ndns.consts.QTYPE_TO_NAME[request.question[0].type];
          var name = request.question[0].name;
          var value = '127.0.0.1';
          var priority = 10;
          //var klass = ndns.consts.QCLASS_TO_NAME[request.question[0].class];

          response.answer.push(
            ndns[type]({
              name: name
            , address: '127.0.0.1'
            , ttl: 43200 // 12 hours
            , data: [value]
            , exchange: value
            , priority: priority || 10
            })
          );
        }());

        response.send();
        return;
      }
    }

    store.getAnswerList(request && request.question.map(function (q) {
      return {
        name: q.name
      , type: ndns.consts.QTYPE_TO_NAME[q.type]
      , class: ndns.consts.QCLASS_TO_NAME[q.class]
      };
    })).then(function (answer) {
      //console.log('answer', answer);
      response.header.aa = 1;
      response.answer = answer.map(function (a) {
        var answer = {
          name: a.name
        , address: a.values[0]
        , data: a.values
        , exchange: a.values[0]
        , priority: a.priority || 10
        , ttl: a.ttl || 600
        };

        if ('CNAME' === a.type) {
          answer.data = answer.data[0];
        }

        return ndns[a.type](answer);
      });

      response.send();
    });
  };
};
