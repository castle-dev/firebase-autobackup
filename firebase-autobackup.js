var fs = require('fs');
var Firebase = require('firebase');
var ref = new Firebase(process.env.FIREBASE_URL);
var firstLoad = true;
var now = new Date();

/* Authenticate to Firebase */
ref.authWithCustomToken(process.env.FIREBASE_SECRET, function (err) {
  if (err) {
    console.log(now.toString(), 'Firebase authentication failed!', err);
  } else if (firstLoad) {
    setInterval(function () {
      console.log(now.toString(), 'Backing up the data...');
      ref.once('value', function (snapshot) {
        var filename = now.toString() + '.json';
        fs.writeFile('backups/' + filename, JSON.stringify(snapshot.exportVal()), function (err) {
          if (err) { console.log(now.toString(), 'Couldn\'t write to the backup file', err); }
          else { console.log(now.toString(), 'Backup saved!', filename); }
        });
      });
    }, 14400000); // every 4 hours
  } else {
      console.log(now.toString(), 'Re-authenticating to firebase');
  }
});

