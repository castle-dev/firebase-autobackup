var Firebase = require('firebase');
var ref = new Firebase(process.env.FIREBASE_URL);
var firstLoad = true;

/* Authenticate to Firebase */
ref.authWithCustomToken(process.env.FIREBASE_SECRET, function (err) {
  if (err) {
    console.log(new Date().toString(), 'Firebase authentication failed!', err);
  } else if (firstLoad) {
    console.log(new Date().toString(), 'Backing up the data...');
    //TODO: Backup the data
  } else {
      console.log(new Date().toString(), 'Re-authenticating to firebase');
  }
});

