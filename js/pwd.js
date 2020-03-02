const database = require('./js/database');
const { ipcRenderer } = require('electron');
const Cryptr = require('cryptr');

let encryptedApiKey = '';

let thisWindow
let cryptr

// Also defined in ./index.js
const API_KEY = '1';

function validatePassword(passText)
{
  var advice = [];
  if (passText.length < 8) {
    advice.push('Must be at least eight characters.');
  }
  const lowerCaseLetters = /[a-z]/g;
  if(!passText.match(lowerCaseLetters)) {
    advice.push('Must have at least one lowercase letter.');
  }
  const upperCaseLetters = /[A-Z]/g;
  if(!passText.match(upperCaseLetters)) {
    advice.push('Must have at least one uppercase letter.');
  }
  const numbers = /[0-9]/g;
  if(!passText.match(numbers)) {
    advice.push('Must have at least one number.');
  }

  if (advice.length > 0) {
    populatePwdTableResults(advice);
    return false;
  }

  // User entered valid string.
  cryptr = new Cryptr(passText);

  // If we have an API Key from previous uses, fetch it to test password decrypt
  if (encryptedApiKey.length > 0) {
    try {
      var dummy = cryptr.decrypt(encryptedApiKey);
    } catch (e) {
      populatePwdTableResults(['Invalid password: Could not authenticate.']);
      return false;
    }
  }

  return true;
}

window.onload = function() {
  // Fetch any password from previous uses
  database.get(API_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      encryptedApiKey = docs[0].value;
    }
  });

  document.getElementById('password').focus();
  populatePwdTableResults(['Must contain at least one number and one uppercase and lowercase letter, and at least 8 or more characters.']);

  // Add the Submit button click event
  document.getElementById('submit').addEventListener('click', () => {

    // Retrieve the input field
    var password = document.getElementById('password');

    if (validatePassword(password.value))
    {
      // Send validated password to the main window
      sendToMain({valid:true, value:password.value});

      // Hack to ensure (?) that password is written to file
      thisWindow = window;
      setTimeout(closeWindow, 500);
    }

  });

  // Add the Cancel button click event
  document.getElementById('cancel').addEventListener('click', () => {
    sendToMain({valid:false});
    window.close();
  });
}

function closeWindow() {
  thisWindow.close();
}

// Populates the results table
function populatePwdTableResults(status) {

  // Generate the table body
  var tableBody = '';
  for (let i = 0; i < status.length; i++) {
    tableBody += '<tr>' + status[i] + '</tr>';
  }

  // Fill the table content
  document.getElementById('table-pwd-results').innerHTML = tableBody;
}

// clears the results table
function clearPwdTableResults() {

    // clear the table content
    document.getElementById('table-pwd-results').innerHTML = '';
}

function sendToMain(pwdData) {
  ipcRenderer.send('request-update-label-in-second-window', pwdData);
}
