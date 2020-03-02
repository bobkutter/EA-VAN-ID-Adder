const database = require('./js/database');
const xlsx = require('xlsx');
const { ipcRenderer } = require('electron');
const Cryptr = require('cryptr');
var request = require('request');

let thisWindow;
let cryptr;

let password = '';
let apiKey = '';
let apiURL = '';


// Use numbers rather than names to make content less obvious
const API_KEY = '1';
const URL_KEY = '2';

// Be ready for password from the password window
ipcRenderer.on('action-update-label', (event, pwdData) => {
  // arg contains the data sent from the first view
  if (pwdData.valid) {
    password = pwdData.value;
    cryptr = new Cryptr(password);

    // Now that we have the valid password, get the settings
    database.get(API_KEY, function(docs) {
      if (docs[0].value.length > 0) {
        encryptedString = docs[0].value;
        apiKey = cryptr.decrypt(encryptedString);
      }
    });

    database.get(URL_KEY, function(docs) {
      k = Object.keys(docs[0]);
      if (docs[0].value.length > 0) {
        encryptedString = docs[0].value;
        apiURL = cryptr.decrypt(encryptedString);
      }
    });

  } else {
    thisWindow.close();
  }
});

window.onload = function() {
  thisWindow = window;

  document.getElementById('workbook').focus();

  // Add the open button click event
  document.getElementById('open').addEventListener('click', () => {

    clearTableResults();

    // Use system dialog to select file name
    const { dialog } = require('electron').remote;
    var fileName = dialog.showOpenDialog();

    // Show file name in the window
    var workbook = document.getElementById('workbook');
    if (typeof(fileName) == 'undefined') {
      workbook.value = '';
    } else {
      workbook.value = fileName;
      populateTableResults(['Click "ADD VAN IDS" to add VAN IDs to workbook']);
    }

  });

  // Add the augment button click event
  document.getElementById('augment').addEventListener('click', () => {

    var workbook = document.getElementById('workbook');
    if (workbook.value != '') {
      augmentWorkbook(workbook.value);
    } else {
      populateTableResults(['Click Open to select file']);
    }

  });

  // Add the settings button click event
  document.getElementById('settings').addEventListener('click', () => {

    // show fields when settings button clicked
    populateTableSettings();

  });
}

// Populates the results table
function populateTableResults(status) {

  // Generate the table body
  var tableBody = '';
  for (let i = 0; i < status.length; i++) {
    tableBody += '<tr>' + status[i] + '</tr>';
  }

  // Fill the table content
  document.getElementById('table-results').innerHTML = tableBody;
}

// clears the results table
function clearTableResults() {

    // clear the table content
    document.getElementById('table-results').innerHTML = '';
}

// Populates the settings table
function populateTableSettings() {

  var colors = ' style="background-color:#33C3F0;color:#FFF" ';

  var pholder = '';
  if (apiKey != '') {
    pholder = 'Already set but hidden for security reasons';
  }
  // Generate the table body
  var tableBody = '<tr>';
  tableBody += '  <td><input type="text" class="three columns" value="API Key" readonly>';
  tableBody += '  <input type="text" class="eight columns" id="api-key" placeholder="'+pholder+'"></td>';
  tableBody += '</tr>';

  tableBody += '<tr>';
  tableBody += '  <td><input type="text" class="three columns" value="API URL" readonly>';
  tableBody += '  <input type="text" class="eight columns" id="api-url" placeholder="'+apiURL+'"></td>';
  tableBody += '</tr>';

  // Generate the table buttons
  tableBody += '<tr>';
  tableBody += '  <td><input type="button" value="Cancel"' + colors + 'onclick="clearTableSettings()">';
  tableBody += '  <input type="button" value="Save"' + colors + 'onclick="saveTableSettings()"></td>';
  tableBody += '</tr>';

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody;

}

// clears the settings table
function clearTableSettings() {

  // clear the table content
  document.getElementById('table-settings').innerHTML = '';
}

// clears the settings table
function saveTableSettings() {

  // Save values from the table into the db
  var v = document.getElementById('api-key').value;
  if (v != '') {
    encryptedString = cryptr.encrypt(v);
    database.update(API_KEY, encryptedString);
    apiKey = v;
  }
  var v = document.getElementById('api-url').value;
  if (v != '') {
    encryptedString = cryptr.encrypt(v);
    database.update(URL_KEY, encryptedString);
    apiURL = v;
  }

  // clear the table content
  document.getElementById('table-settings').innerHTML = '';
}

function augmentWorkbook(workbookName) {

  try {
    var workbook = xlsx.readFile(workbookName);
  } catch (e) {
    populateTableResults([e.message]);
    return;
  }
  const sheetName = workbook.SheetNames[0];
  const xSheet = workbook.Sheets[sheetName];
  const jSheet = xlsx.utils.sheet_to_json(xSheet,{defval:''});

  // Save original column order with VAN ID added in first column
  var keys;
  try {
    keys = Object.keys(jSheet[0]);
  } catch (e) {
    populateTableResults(['The format of "'+workbookName+'" is invalid.','Please verify that it is a spreadsheet.']);
    return;
  }
  keys.unshift('VANID');

  // find dictionary entries for email address, first and last Names
  try {
    emailKey = findHeaderInfo(keys, 'email');
    firstNameKey = findHeaderInfo(keys, 'first name');
    lastNameKey = findHeaderInfo(keys, 'last name');
  } catch (e) {
    populateTableResults([e.message+' in ' + workbookName,'The header row should be the first row in the sheet.']);
    return;
  }

  var closure = {
    "wb": workbook,
    "wbn": workbookName,
    "shn": sheetName,
    "sht": jSheet,
    "k": keys,
    "tot": jSheet.length,
    "cnt": 0
  }

  for (i = 0; i < jSheet.length; i++) {
    insertVANID(jSheet[i], i, emailKey, firstNameKey, lastNameKey, writeNewWorkbook, closure);
  }
}

function writeNewWorkbook(closure) {

  if (++closure.cnt < closure.tot) {
    return;
  }

  workbook = closure["wb"];
  workbookName = closure["wbn"];
  sheetName = closure["shn"];
  jSheet = closure["sht"];
  keys = closure["k"];

  const xNewSheet = xlsx.utils.json_to_sheet(jSheet,{header:keys});
  try {
    xlsx.utils.book_append_sheet(workbook, xNewSheet, sheetName+' with VANIDs');
  } catch (e) {
    populateTableResults([e.message,'Please remove sheet "'+sheetName+' with VANIDs".']);
    return;
  }
  xlsx.writeFile(workbook, workbookName);

  populateTableResults(['Added new "'+sheetName+' with VANIDs" sheet to '+workbookName+'.']);
}

function findHeaderInfo(keys, pattern) {

  for (let i = 0; i < keys.length; i++) {

    if (keys[i].toLowerCase().indexOf(pattern) != -1) {
      return keys[i];
    }
  }

  throw {
    name:"File Format Error",
    message:'Could not locate '+pattern+' column in header row.'
  };
}

function insertVANID(jRow, vanID, emailKey, firstNameKey, lastNameKey, fnc, closure) {

  vanID = postRequest(jRow[emailKey], jRow[firstNameKey], jRow[lastNameKey], function(vid) {
    jRow['VANID'] = vid;
    fnc(closure);
  });
}

function postRequest(emailAddr, firstName, lastName, fnc) {
  const Matched = 302; // HTTP status value

  var username = '350Seattle';
  var dbMode = '1';
  var options = {
    headers: { 'Content-type' : 'application/json' },
    auth: {
      user: username,
      password: apiKey + '|' + dbMode
    },
    json: {
      'firstName': firstName,
      'lastName': lastName,
      'emails': [ { 'email': emailAddr } ]
    },
    uri: apiURL
  };
  request.post(options, function (err, res, body) {
    if (err) {
      console.log('error for:'+firstName+' '+lastName+'='+err);
      fnc('');
    }
    if (res.statusCode == Matched) {
      fnc(body.vanId);
    } else {
      console.log('error for:'+firstName+' '+lastName+'='+res.statusCode);
      fnc('');
    }
  });
}
