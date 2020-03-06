const database = require('./js/database')
const xlsx = require('xlsx')
const Cryptr = require('cryptr')
var https = require('https')
var request = ''

let cryptr

var thisWindow;

// Set before password is available
let encryptedApiKey = ''

// Set when correct password is entered
let password = ''
let apiKey = ''
let apiHost = ''
let apiPath = ''
let apiUser = ''

const shtSuffix = ' with VANIDs'
const btnColor = ' style="background-color:#33C3F0;color:#FFF" '

// Use numbers rather than names to make db content less obvious
const API_KEY = '1'
const HOST_KEY = '2'
const PATH_KEY = '3'
const USER_KEY = '4'

// Global variables because I couldn't figure out how to pass arg to showDetails
var augmentResults = []
var missingPersons = []

function validatePassword(passText) {

  var advice = []
  if (passText.length < 8) {
    advice.push('Must be at least eight characters.')
  }
  const lowerCaseLetters = /[a-z]/g
  if(!passText.match(lowerCaseLetters)) {
    advice.push('Must have at least one lowercase letter.')
  }
  const upperCaseLetters = /[A-Z]/g
  if(!passText.match(upperCaseLetters)) {
    advice.push('Must have at least one uppercase letter.')
  }
  const numbers = /[0-9]/g
  if(!passText.match(numbers)) {
    advice.push('Must have at least one number.')
  }

  if (advice.length > 0) {
    populateTableResults(advice)
    return false
  }

  // User entered valid string.
  cryptr = new Cryptr(passText)

  // If we have apiKey from previous uses, fetch it to test password decrypt
  if (encryptedApiKey.length > 0) {
    try {
      apiKey = cryptr.decrypt(encryptedApiKey)
    } catch (e) {
      populateTableResults(['Invalid password: Could not authenticate.'])
      return false
    }
  }

  return true
}

window.onload = function() {

  thisWindow = window

  // Fetch settings from previous uses
  database.get(API_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      encryptedApiKey = docs[0].value
    }
  })
  database.get(HOST_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      apiHost = docs[0].value
    }
  })
  database.get(PATH_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      apiPath = docs[0].value
    }
  })
  database.get(USER_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      apiUser = docs[0].value
    }
  })

  populateTableMainWithPassword()
}

// Populates the main command table
function populateTableMainWithPassword() {

  // Generate the table body
  var tableBody = '<tr>'
  tableBody += '<input type="password" class="four columns" placeholder="Enter password" id="password" pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}">'
  tableBody += '<input type="button"  class="two columns" value="Submit"' + btnColor + 'onclick="handleSubmittedPassword()">'
  tableBody += '</tr>'
  tableBody += '<tr> Must contain at least one number and one uppercase and lowercase letter, and at least 8 or more characters.</tr>'


  // Fill the table content
  document.getElementById('table-main').innerHTML = tableBody

  document.getElementById('password').focus()
}

function handleSubmittedPassword() {

  password = document.getElementById('password')
  if (validatePassword(password.value))
  {
    populateTableMainWithAdder('')
    populateTableSettings(false)
  }
}

// Populates the main command table
function populateTableMainWithAdder(fileName) {

  clearTableResults()

  // Generate the table body
  var tableBody = '<tr>'
  tableBody += '<td><input type="button"  class="two columns" value="Open"' + btnColor + 'onclick="handleOpen()">'
  tableBody += '<input type="text" class="seven columns" value="'+fileName+'" placeholder="Click Open to select file" id="workbook">'
  tableBody += '<input type="button"  class="three columns" value="Add VAN IDs"' + btnColor + 'onclick="handleAugment()"></td>'
  tableBody += '</tr>'

  // Fill the table content
  document.getElementById('table-main').innerHTML = tableBody

  document.getElementById('workbook').focus()
}

function handleOpen() {

  clearTableResults()

  // Use system dialog to select file name
  const { dialog } = require('electron').remote
  promise = dialog.showOpenDialog()
  promise.then(
    result => handleOpenResult(result['filePaths'][0]),
    error => alert(error)
  )
}

function handleOpenResult(fileName) {

  // Show file name in the text box
  if (typeof(fileName) == 'undefined') {
    populateTableMainWithAdder('')
  } else {
    populateTableMainWithAdder(fileName)
    populateTableResults(['Click "ADD VAN IDS" to add VAN IDs to workbook'])
  }
}

function handleAugment() {

  var workbook = document.getElementById('workbook')
  if (workbook.value != '') {
    augmentWorkbook(workbook.value)
  } else {
    populateTableResults(['Click Open to select file'])
  }
}

// Populates the results table
function populateTableResults(status) {

  // Generate the table body
  var tableBody = ''
  for (let i = 0; i < status.length; i++) {
    tableBody += '<tr>' + status[i] + '</tr>'
  }

  // Fill the table content
  document.getElementById('table-results').innerHTML = tableBody
}

// clears the results table
function clearTableResults() {

    // clear the table content
    document.getElementById('table-results').innerHTML = ''
}

// Populates the settings table
function populateTableSettings(all) {

  var pholder = ''
  if (apiKey != '') {
    pholder = 'Already set but hidden for security reasons'
  }
  // Generate the table body
  let tableBody = createTableSettingsButton()

  if (all) {
    tableBody += '<td><input type="text" class="three columns" value="API Key" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-key" placeholder="'+pholder+'"></td>'
    tableBody += '</tr>'

    tableBody += '<tr>'
    tableBody += '<td><input type="text" class="three columns" value="API Host" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-host" placeholder="'+apiHost+'"></td>'
    tableBody += '</tr>'

    tableBody += '<tr>'
    tableBody += '<td><input type="text" class="three columns" value="API Path" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-path" placeholder="'+apiPath+'"></td>'
    tableBody += '</tr>'

    tableBody += '<tr>'
    tableBody += '<td><input type="text" class="three columns" value="API User" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-user" placeholder="'+apiUser+'"></td>'
    tableBody += '</tr>'

    // Generate the table buttons
    tableBody += '<tr>'
    tableBody += '<td><input type="button" value="Cancel"' + btnColor + 'onclick="populateTableSettings(false)"> '
    tableBody += '<input type="button" value="Save"' + btnColor + 'onclick="saveTableSettings()"></td>'
    tableBody += '</tr>'
  }

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
}

// saves values then clears the settings table
function saveTableSettings() {

  // Save values from the table into the db
  var v = document.getElementById('api-key').value
  if (v != '') {
    encryptedString = cryptr.encrypt(v)
    database.update(API_KEY, encryptedString)
    apiKey = v
  }
  v = document.getElementById('api-host').value
  if (v != '') {
    database.update(HOST_KEY, v)
    apiHost = v
  }
  v = document.getElementById('api-path').value
  if (v != '') {
    database.update(PATH_KEY, v)
    apiPath = v
  }
  v = document.getElementById('api-user').value
  if (v != '') {
    database.update(USER_KEY, v)
    apiUser = v
  }

  // Revert to closed settings section
  let tableBody = createTableSettingsButton()
  document.getElementById('table-settings').innerHTML = tableBody
}

function createTableSettingsButton() {

  let tableBody = '<tr><td>'
  tableBody += '<input type="button" value="Exit" class="two columns"' + btnColor + 'onclick="exitApp()">'
  tableBody += '</td></tr><tr><td>'
  tableBody += '<input type="button" value="Settings"' + btnColor + 'onclick="populateTableSettings(true)">'
  tableBody += '</td></tr>'

  return tableBody
}

function exitApp() {
  thisWindow.close()
  thisWindow = null;
}

function augmentWorkbook(workbookName) {

  populateTableResults(['Working...'])

  // Open specified file
  try {
    var workbook = xlsx.readFile(workbookName)
  } catch (e) {
    populateTableResults([e.message])
    return
  }

  // Assume first sheet is the one
  const sheetName = workbook.SheetNames[0]
  const xSheet = workbook.Sheets[sheetName]
  const jSheet = xlsx.utils.sheet_to_json(xSheet,{defval:''})

  // Check if augmented sheet already exists
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    if (workbook.SheetNames[i] == sheetName+shtSuffix) {
      populateTableResults(['Sheet "'+sheetName+shtSuffix+'" already exists in the "'+workbookName+'" workbook. Please remove this sheet.'])
      return
    }
  }

  // Save original column order with VAN ID added in first column
  var keys
  try {
    keys = Object.keys(jSheet[0])
  } catch (e) {
    populateTableResults(['The format of "'+workbookName+'" is invalid.','Please verify that it is a spreadsheet.'])
    return
  }
  keys.unshift('VANID')

  // find dictionary entries for email address, first and last Names
  try {
    emailKey = findHeaderInfo(keys, 'email')
    firstNameKey = findHeaderInfo(keys, 'first name')
    lastNameKey = findHeaderInfo(keys, 'last name')
  } catch (e) {
    populateTableResults([e.message+' in ' + workbookName,'The header row should be the first row in the sheet.'])
    return
  }

  var closure = {
    'wb': workbook,
    'wbn': workbookName,
    'shn': sheetName,
    'sht': jSheet,
    'k': keys,
    'tot': jSheet.length,
    'cnt': 0,
    'fnd': 0
  }

  missingPersons = []
  for (i = 0; i < jSheet.length; i++) {
    insertVANID(jSheet[i], i, emailKey, firstNameKey, lastNameKey, writeNewWorkbook, closure)
  }
}

function writeNewWorkbook(closure) {

  total = closure.tot

  if (++closure.cnt < total) {
    return
  }

  workbook = closure.wb
  workbookName = closure.wbn
  sheetName = closure.shn
  jSheet = closure.sht
  keys = closure.k
  found = closure.fnd

  const xNewSheet = xlsx.utils.json_to_sheet(jSheet,{header:keys})
  try {
    xlsx.utils.book_append_sheet(workbook, xNewSheet, sheetName+shtSuffix)
    xlsx.writeFile(workbook, workbookName)
  } catch (e) {
    populateTableResults([+e.message])
    return
  }

  augmentResults = ['Created new "'+sheetName+shtSuffix+'" sheet in '+workbookName+'.']
  augmentResults.push('Added VAN IDs to '+found+' out of '+total+' rows.')
  if (found != total) {
    augmentResults.push('<td><input type="button" value="Show Missing Persons"' + btnColor + 'onclick="showDetails()"></td>')
  }
  populateTableResults(augmentResults)
}

function showDetails() {

  augmentResults.pop()
  augmentResults.push('<td><input type="button" value="Hide Missing Persons"' + btnColor + 'onclick="hideDetails()"></td>')
  populateTableResults(augmentResults)

  // Generate the table body
  var tableBody = ''
  for (let i = 0; i < missingPersons.length; i++) {
    tableBody += missingPersons[i]
  }

  // Fill the table content
  document.getElementById('table-missing-persons').innerHTML = tableBody
}

function hideDetails() {

  augmentResults.pop()

  augmentResults.push('<td><input type="button" value="Show Missing Persons"' + btnColor + 'onclick="showDetails()"></td>')
  populateTableResults(augmentResults)
  document.getElementById('table-missing-persons').innerHTML = ''
}

function findHeaderInfo(keys, pattern) {

  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase().indexOf(pattern) != -1) {
      return keys[i]
    }
  }

  throw {
    name:'File Format Error',
    message:'Could not locate '+pattern+' column in header row'
  }
}

function insertVANID(jRow, vanID, emailKey, firstNameKey, lastNameKey, fnc, closure) {

  vanID = postRequest(jRow[emailKey], jRow[firstNameKey], jRow[lastNameKey], function(vid) {
    jRow['VANID'] = vid

    if (vid == null) {
      let tableRow = '<tr>'
      tableRow += '<td>'+jRow[firstNameKey]+'</td>'
      tableRow += '<td>'+jRow[lastNameKey]+'</td>'
      tableRow += '<td>'+jRow[emailKey]+'</td>'
      tableRow += '</tr>'
      missingPersons.push(tableRow)
    } else {
      closure.fnd++
    }

    fnc(closure)
  })
}

function postRequest(emailAddr, firstName, lastName, fnc) {

  var vanID = ''
  const username = apiUser + ':' + apiKey + '|1';

  const data = JSON.stringify({
    'firstName': firstName,
    'lastName': lastName,
    'emails': [ { 'email': emailAddr } ]
  })

  const options = {
    hostname: 'api.securevan.com',
    port: 443,
    path: '/v4/people/find',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      'Authorization': 'Basic ' + new Buffer(username).toString('base64')
    }
  }

  const req = https.request(options, res => {
    res.on('data', d => {
      const jd = JSON.parse(d)
      vanID = jd.vanId
      fnc(vanID)
    })
  })

  req.on('error', error => {
    alert(error)
  })

  req.write(data)
  req.end()
}
