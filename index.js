if (!process.env.FIREBASE_SECRET ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER) {
  console.log(new Date().toString(), 'FIREBASE_SECRET, TWILIO_ACCOUNT_ID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER required. Please include them in your environment variables.');
  process.exit();
}

var Firebase = require('firebase');
var EmailService = require('./services/email');
var PhoneService = require('./services/phone');
var BankService = require('./services/bank');
var express = require('express');
var bodyParser = require('body-parser');
var api = require('./endpoints');
var ref = new Firebase(process.env.FIREBASE_URL);
var endpoints = new api(EmailService, BankService, PhoneService, ref);
var app = express();
app.use(bodyParser.urlencoded({ extended: false })); // parse application/x-www-form-urlencoded
app.use(bodyParser.json()); // parse application/json
var firstLoad = true;

/* Authenticate to Firebase */
ref.authWithCustomToken(process.env.FIREBASE_SECRET, function (err) {
  if (err) {
    console.log(new Date().toString(), 'Firebase authentication failed!', err);
    EmailService.send('Firebase authentication failed', 'errors@entercastle.com', err);
  } else if (firstLoad) {
    /* Register Firebase Listeners */
    console.log(new Date().toString(), 'Registering firebase listeners');
    firstLoad = false;

    // When a user is created, email out an alert
    ref.child('profile').on('child_added', function (snapshot) {
      var profile = snapshot.val();
      if (!(profile.alerts && profile.alerts.signup)) {
        var body = profile.firstName + ' ' + profile.lastName + ' ' + profile.email + ' ' + profile.phoneNumber;
        console.log(new Date().toString(), 'New User: ', body);
        EmailService
        .send('New User', 'alerts@entercastle.com', body)
        .then(function () {
          ref.child('profile').child(snapshot.key()).child('alerts').child('signup').set(true);
        })
        .catch(function (err) { console.log(new Date().toString(), err); });
      }
    });

    // When a property is added, email out an alert
    ref.child('properties').on('child_added', function (user) {
      var uid = user.key();
      user.ref().on('child_added', function (snapshot) {
        var property = snapshot.val();
        if (!(property.alerts && property.alerts.added)) {
          var body = property.street + ', ' + property.city + ', ' + property.stateAbbreviation + ' added by user ' + uid;
          console.log(new Date().toString(), 'New Property: ', body);
          EmailService
          .send('New Property', 'alerts@entercastle.com', body)
          .then(function () {
            ref.child('properties').child(uid).child(snapshot.key()).child('alerts').child('added').set(true);
          })
          .catch(function (err) { console.log(new Date().toString(), err); });
        }
      });
    });

    // When a new application is submitted, send an alert
    ref.child('applications').on('child_added', function (property) {
      var propertyId = property.key();
      property.ref().on('child_added', function (snapshot) {
        var applicant = snapshot.val();
        if (!(applicant.alerts && applicant.alerts.apply)) {
          var body = applicant.firstName + ' ' + applicant.lastName + '\n' + applicant.email + '\n' + applicant.phoneNumber;
          console.log(new Date().toString(), 'New Applicant:', applicant.firstName, applicant.lastName);
          EmailService
          .send('New Applicant', 'applicants@entercastle.com', body)
          .then(function () {
            ref.child('applications').child(propertyId).child(snapshot.key()).child('alerts').child('apply').set(true);
          })
          .catch(function (err) { console.log(new Date().toString(), err); });
        }
      });
    });

    // When a user's credit card token appears, claim the card
    ref.child('profile').on('child_changed', function (snapshot) {
      var profile = snapshot.val();
      if (profile.creditCardToken) {
        console.log(new Date().toString(), 'Linking credit card:', profile.creditCardToken);
        var token = profile.creditCardToken;
        var name = profile.firstName + ' ' + profile.lastName;
        var email = profile.email;
        BankService
        .claimCreditCard(token, name, email)
        .then(function (stripeCustomerId) {
          ref.child('profile').child(snapshot.key()).child('creditCardToken').remove();
          ref.child('profile').child(snapshot.key()).child('stripeCustomerId').set(stripeCustomerId);
        })
        .catch(function (err) {
          console.log(new Date().toString(), 'Error while attempting to claim credit card', err);
          EmailService.send('Couldn\'t claim credit card', 'errors@entercastle.com', name + '\n' + email + '\n' + token + '\n' + err);
        });
      }
    });

    // When a user's bank account token appears, claim the account
    ref.child('profile').on('child_changed', function (snapshot) {
      var profile = snapshot.val();
      if (profile.bankAccountToken) {
        console.log(new Date().toString(), 'Linking bank account:', profile.bankAccountToken);
        var token = profile.bankAccountToken;
        var name = profile.firstName + ' ' + profile.lastName;
        BankService
        .claimBankAccount(token, name)
        .then(function () {
          ref.child('profile').child(snapshot.key()).child('bankAccountToken').remove();
          ref.child('profile').child(snapshot.key()).child('balancedBankAccountId').set(token);
        })
        .catch(function (err) {
          console.log(new Date().toString(), 'Error while attempting to claim bank account', err);
          EmailService.send('Couldn\'t claim bank account', 'errors@entercastle.com', name + '\n' + token + '\n' + err);
        });
      }
    });

    // When a tenant bank account token appears, claim the account and start the verification process
    ref.child('tenants').on('child_added', function (property) {
      property.ref().on('child_changed', function (snapshot) {
        var tenant = snapshot.val();
        var tenantRef = ref.child('tenants').child(property.key()).child(snapshot.key());
        if (tenant.bankAccountToken) {
          console.log(new Date().toString(), 'Linking tenant bank account:', tenant.bankAccountToken);
          var token = tenant.bankAccountToken;
          var name = tenant.firstName + ' ' + tenant.lastName;
          BankService
          .claimBankAccount(token, name)
          .then(function () {
            tenantRef.child('bankAccountToken').remove();
            tenantRef.child('balancedBankAccountId').set(token);
            return BankService.createBankAccountVerification(token);
          })
          .then(function (bankAccountVerificationToken) {
            tenantRef.child('bankAccountVerificationToken').set(bankAccountVerificationToken);
            tenantRef.child('bankAccountVerificationAttempts').set(0);
            ref.child('indexes').child('bankAccountVerifications').child(bankAccountVerificationToken).set({
              propertyId: property.key(),
              tenantId: snapshot.key()
            });
            console.log(new Date().toString(), 'Bank account verification created:', bankAccountVerificationToken);
          })
          .catch(function (err) {
            console.log(new Date().toString(), 'Error while attempting to claim bank account', err);
            EmailService.send('There was an error claiming a tenant bank account', 'errors@entercastle.com', name + '\n' + token + '\n' + err);
          });
        }
        if (tenant.phoneNumber) {
          ref.child('indexes').child('phoneNumber').child(tenant.phoneNumber).set({
            propertyId: property.key(),
            tenantId: snapshot.key()
          })
        }
      });
    });

    /* Create HTTP Endpoints */
    app.post('/balanced', endpoints.balancedWebhook);
    app.post('/twilio', endpoints.twilioWebhook);

    /* Expose HTTP Endpoints */
    var server = app.listen(9876, function () {
      var host = server.address().address
      var port = server.address().port
      console.log(new Date().toString(), 'Server listening at http://' + host + ':' + port);
    });

  } else {
      console.log(new Date().toString(), 'Re-authenticating to firebase');
  }
});

