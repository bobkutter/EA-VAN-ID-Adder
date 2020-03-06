// Initialize the database
var Datastore = require('nedb')
let db = new Datastore({ filename: 'db/settings.db', autoload: true })

exports.update = function(key, value) {

  db.remove({"key": key}, {}, function(err, numRemoved) {
    db.insert({"key": key, "value": value}, function(err, newDocs) {
    })
  })
}

exports.get = function(key, fnc) {

  // Look up key
  db.find({ "key": key}, function(err, docs) {

    if (docs.length == 0) {
        fnc([{"key": key, "value": ''}])
    } else {
      fnc(docs)
    }
  })
}
