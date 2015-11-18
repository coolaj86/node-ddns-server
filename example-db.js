module.exports.create = function () {
  return {
    getAnswerList: function (questions, cb) {
      // http://www.zytrax.com/books/dns/ch15/#qname
      // questions = [{ name, type, class }]
      var answers = [];

      questions.forEach(function (q) {
        var a = {
          name: q.name
        , type: q.type
        , ttl: 600
        , priority: 10
        , answer: null
        };

        switch(q.type) {
          case 'AAAA':
            a.answer = '0:0:0:0:0:0:0:1'; // '::1';
            break;

          case 'MX':
          case 'A':
          case 'CNAME':
            a.type = 'CNAME';
            a.answer = 'example-cname' + q.name;
            // NOTE: when implementing you TODO do CNAME lookup and return multiple A records
            answers.push(a);
            // NOTE an implementer should do the lookup
            answers.push({
              type: q.type
            , name: 'example-cname' + q.name
            , ttl: 600
            , priority: null
            , answer: '127.0.0.1'
            });
            return;

          default:
            return;
        }

        answers.push(a);
      }).filter(function (a) {
        return a;
      });

      cb(null, answers);
    }
  };
};
