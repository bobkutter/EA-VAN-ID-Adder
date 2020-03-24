// Initialize the database
var Datastore = require('nedb')

exports.open = function(fileName) {
  return new Datastore({ filename: fileName, autoload: true })
}

exports.update = function(db, key, value) {

  db.remove({"key": key}, {}, function(err, numRemoved) {
    db.insert({"key": key, "value": value}, function(err, newDocs) {
    })
  })
}

exports.get = function(db, key, fnc) {

  // Look up key
  db.find({ "key": key}, function(err, docs) {

    if (docs.length == 0) {
        fnc([{"key": key, "value": ''}])
    } else {
      fnc(docs)
    }
  })
}
