var fs = require('fs');
var Firebase = require('firebase');
var ref = new Firebase(process.env.FIREBASE_URL);
var firstLoad = true;
var millisecondsBetweenBackups = 14400000; // every four hours

console.log('Starting backup process...');

/* Authenticate to Firebase */
ref.authWithCustomToken(process.env.FIREBASE_SECRET, function (err) {
  if (err) {
    console.log('Firebase authentication failed!', err);
  } else if (firstLoad) {
    console.log('Firebase authentication successful...');
    setInterval(function () {
      var now = new Date();
      console.log(now.toString(), 'Backing up the data...');
      ref.once('value', function (snapshot) {
        var filename = now.getTime() + '-' + now.toString() + '.json';
        fs.writeFile('backups/' + filename, JSON.stringify(snapshot.exportVal()), function (err) {
          if (err) { console.log(now.toString(), 'Couldn\'t write to the backup file', err); }
          else { console.log(now.toString(), 'Backup saved!', filename); }
        });
      });
    }, millisecondsBetweenBackups);
  } else {
      console.log('Re-authenticating to firebase');
  }
});

