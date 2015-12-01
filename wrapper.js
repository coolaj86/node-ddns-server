'use strict';

module.exports.create = function (walnutConf, deps/*, options*/) {
  // TODO there needs to be a way to get the config from the system db
  var PromiseA = deps.Promise;
  var wrap = require('masterquest-sqlite3');
  var port = walnutConf.ddnsPort || 53;
  var address4 = walnutConf.ddnsAddress4 || '0.0.0.0';
  //var address6 = walnutConf.ddnsAddress6 || '0.0.0.0';
  var conf = {
    primaryNameserver: walnutConf.primaryNameserver
  , nameservers: walnutConf.nameservers
  };
  var dir = [
    // TODO consider zones separately from domains
    // i.e. jake.smithfamily.com could be owned by jake alone
    { tablename: 'domains'
    , idname: 'id' // crypto random
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'revokedAt', 'zone', 'name', 'type', 'value', 'device']
    , hasMany: ['accounts', 'groups']
    }
  , { tablename: 'accounts_domains'
    , idname: 'id'
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'revokedAt', 'accountId']
    , hasMany: ['accounts', 'domains']
    }
  , { tablename: 'domains_groups'
    , idname: 'id'
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'revokedAt', 'accountId']
    , hasMany: ['domains', 'groups']
    }
  ];

  function getZone(DnsStore, zones, zonesMap) {
    var promise = PromiseA.resolve();

    zones.forEach(function (zone) {
      promise = promise.then(function () {

        // TODO this won't perform well with thousands of records (but that's not a problem yet)
        // maybe store a list of big zones with subzones in memory?
        // (and assume a single device won't more than 100 of them - which would be 100,000 domains)
        return DnsStore.Domains.find({ zone: zone }).then(function (rows) {
          rows.forEach(function (row) {
            if (!row.name) {
              row.name = row.zone;
            }
          });

          zonesMap[zone] = rows;
          //zones.push(rows);
        });
      });
    });

    return promise;
  }

  return deps.systemSqlFactory.create({
    init: true
  , dbname: 'dns'
  }).then(function (dnsdb) {
    return wrap.wrap(dnsdb, dir);
  }).then(function (DnsStore) {
    function getAnswerList(questions, cb) {
      // cb is of type function (err, answers) { }
      // answers is an array of type { name: string, type: string, priority: int, ttl: int, answer: string }
      var zonesMap = {};
      var zones = [];

      // determine the zone and then grab all records in the zone
      // 'music.cloud.jake.smithfamily.com'.split('.').slice(-2).join('.')
      // smithfamily.com // this is the zone (sorry jake, no zone for you)
      questions.forEach(function (q) {
        // TODO how to get zone fast and then get records?
        var parts = q.name.split('.').filter(function (n) {
          return n;
        });
        var zone = parts.slice(-2).join('.');

        if (parts.length < 2) {
          return;
        }

        if (!zonesMap[zone]) {
          zonesMap[zone] = true;
          zones.push(zone);
          return;
        }
      });

      // TODO handle recursive ANAME (and CNAME?) lookup
      return getZone(DnsStore, zones, zonesMap).then(function () {
        var records = [];

        Object.keys(zonesMap).forEach(function (key) {
          zonesMap[key].forEach(function (record) {
            records.push(record);
          });
        });

        return records;
      }).then(function (ans) {
        cb(null, ans);
      }, function (err) {
        cb(err);
      });
    }

    return require('./server').create(port, address4, conf, getAnswerList).listen().then(function (closer) {
      // closer.close
      closer.DnsStore = DnsStore;
      return closer;
    });
  });
};
