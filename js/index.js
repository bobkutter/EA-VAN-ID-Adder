const Database = require('./js/database')
const Xlsx = require('xlsx')
const Cryptography = require('cryptr')
var Https = require('https')
var OS = require('os')

let Cryptr

var ThisWindow

let SettingsDb
let OrgsDb

let Organizations = {}

// Set before password is available
let EncryptedApiKey = ''

// Set when correct password is entered
let Password = ''
let ApiKey = ''
let ApiHost = ''
let ApiPath = ''
let ApiUser = ''

const SheetSuffix = ' with VANIDs'

const LightBlue = ' style="background-color:#33C3F0;color:#FFF" '
const DarkBlue = ' style="background-color:#3365f0;color:#FFF" '
const ErrorRow = ' style="background-color:#e32636;color:#000" '
const WarnRow = ' style="background-color:#ffbf00;color:#000" '
const OkayRow = ' style="background-color:#5f9ea0;color:#000" '

// Use numbers rather than names to make db content less obvious
const API_KEY = '1'
const HOST_KEY = '2'
const PATH_KEY = '3'
const USER_KEY = '4'

// Global variables because I couldn't figure out how to pass arg to showDetails
let AugmentResults = []
let MissingPersons = []
let PersonsFoundByEmail = []
let OrgsFound = []

// Global variable because I couldn't figure out how to pass arg to updateOrgsFile
let OrgFileName = ''

function validatePassword(passText, advice, decrypt=true) {

  if (passText.length < 8) {
    advice.push('Must be at least eight characters.')
  }
  if(!passText.match(/[a-z]/g)) {
    advice.push('Must have at least one lowercase letter.')
  }
  if(!passText.match(/[A-Z]/g)) {
    advice.push('Must have at least one uppercase letter.')
  }
  if(!passText.match(/[0-9]/g)) {
    advice.push('Must have at least one number.')
  }

  if (advice.length > 0) {
    return false
  }

  if (decrypt)
  {
    // User entered valid string.
    Cryptr = new Cryptography(passText)

    // If we have apiKey from previous uses, fetch it to test password decrypt
    if (EncryptedApiKey.length > 0) {
      try {
        ApiKey = Cryptr.decrypt(EncryptedApiKey)
      } catch (e) {
        advice.push('Invalid password: Could not authenticate.')
        return false
      }
    }
  }

  return true
}

window.onload = function() {

  ThisWindow = window

  let dataDir = OS.homedir()+'/EA-VAN-ID-Adder/'
  console.log('opening dbs in: '+dataDir)
  SettingsDb = Database.open(dataDir+'settings.db')
  OrgsDb = Database.open(dataDir+'orgs.db')

  // Fetch settings from previous uses
  Database.get(SettingsDb, API_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      EncryptedApiKey = docs[0].value
    }
  })
  Database.get(SettingsDb, HOST_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      ApiHost = docs[0].value
    }
  })
  Database.get(SettingsDb, PATH_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      ApiPath = docs[0].value
    }
  })
  Database.get(SettingsDb, USER_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      ApiUser = docs[0].value
    }
  })

  populateTableMainWithPassword()
}

// Populates the main command table
function populateTableMainWithPassword() {

  // Generate the table body
  let tableBody = ''
  tableBody += '<tr>'
  tableBody += '<p>Must contain at least one number and one uppercase and lowercase letter, and at least 8 or more characters.</p>'
  tableBody += '</tr>'

  tableBody += '<tr>'
  tableBody += '<input type="password" class="four columns" placeholder="Enter password" id="password" pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}">'
  tableBody += '<input type="button"  class="two columns" id="submit" value="Submit"' + LightBlue + 'onclick="handleSubmittedPassword()">'
  tableBody += '</tr>'

  // Fill the table content
  document.getElementById('table-main').innerHTML = tableBody

  // put cursor in text input
  let input = document.getElementById('password')
  input.focus()

  // treat enter key like submit button
  input.addEventListener("keyup", function(event) {
  // Number 13 is the "Enter" key on the keyboard
    if (event.keyCode === 13) {
      // Cancel the default action, if needed
      event.preventDefault();
      // Trigger the button element with a click
      document.getElementById('submit').click();
    }
  });
}

function handleSubmittedPassword() {

  let advice = []

  Password = document.getElementById('password').value
  if (validatePassword(Password, advice))
  {
    populateTableResults(['Loading data, please wait...'])
    loadOrganizations(switchToAddrScreen)
  } else {
    populateTableResults(advice)
  }
}

function changePassword() {

  let advice = []

  console.log('changing password')
  populateTableResults([])

  currentPwd = document.getElementById('pwd').value
  if (currentPwd != Password) {
    showSettingsResults(['Invalid password: could not authenticate current password.'])
    return
  }

  let newPassword = document.getElementById('npwd')
  if (!validatePassword(newPassword.value, advice, false)) {
    showSettingsResults(advice)
    return
  }

  confirmedPwd = document.getElementById('cpwd')
  if (confirmedPwd.value == '') {
    showSettingsResults(['Please confirm new password.'])
    return
  }
  if (confirmedPwd.value != newPassword.value) {
    showSettingsResults(['New passwords do not match.'])
    return
  }

  // update encrypted API Key on disk, then keep new password in memory
  Cryptr = new Cryptography(newPassword.value)
  let encryptedString = Cryptr.encrypt(ApiKey)
  Database.update(SettingsDb, API_KEY, encryptedString)
  Password = newPassword.value

  storeOrganizations()

  showSettingsResults(['New password accepted.'])

  // Give user a chance to see success message
  setTimeout(switchToAddrScreen, 1000);
}

function switchToAddrScreen() {

  populateTableMainWithAdder('')
  document.getElementById('table-submain-results').innerHTML = ''
  populateTableSettings(false)
}

function showSettingsResults(results) {

  let tableBody = ''
  for (let i = 0; i < results.length; i++) {
    tableBody += '<tr>'+results[i]+'</tr>'
  }

  document.getElementById('table-settings-results').innerHTML = tableBody
}

// Populates the main command table
function populateTableMainWithAdder(fileName) {

  clearTableResults()

  // Generate the table body
  let tableBody = '<tr>'
  tableBody += '<td><input type="button" class="two columns" value="Open"' + LightBlue + 'onclick="handleOpen()">'
  tableBody += '<input type="text" class="seven columns" value="'+fileName+'" placeholder="Click Open to select file" id="workbook">'
  tableBody += '<input type="button" class="three columns" value="Add VAN IDs"' + LightBlue + 'onclick="handleAugment()"></td>'
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
  } else if (fileName.toLowerCase().indexOf('.csv') != -1) {
    populateTableMainWithAdder('')
    populateTableResults(['File type "csv" not supported.'])
  } else {
    populateTableMainWithAdder(fileName)
    populateTableResults(['Click "ADD VAN IDS" to add VAN IDs to workbook'])
  }
}

function handleAugment() {

  let workbook = document.getElementById('workbook')
  if (workbook.value != '') {
    augmentWorkbook(workbook.value)
  } else {
    populateTableResults(['Click Open to select file'])
  }
}

// Populates the results table
function populateTableResults(status) {

  // Generate the table body
  let tableBody = ''
  for (let i = 0; i < status.length; i++) {
    tableBody += '<tr>' + status[i] + '</tr>'
  }

  // Fill the table content
  document.getElementById('table-main-results').innerHTML = tableBody
}

// clears the results table
function clearTableResults() {

    // clear the table content
    document.getElementById('table-main-results').innerHTML = ''
}

// Populates the settings table
function populateTableSettings(all) {

  let pholder = ''
  if (ApiKey != '') {
    pholder = 'Already set but hidden for security reasons'
  }
  // Generate the table body
  let tableBody = createTableSettingsButton('')

  if (all) {
    tableBody = createTableSettingsButton('settings')
    tableBody += '<td><input type="text" class="three columns" value="API Key" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-key" placeholder="'+pholder+'"></td>'
    tableBody += '</tr>'

    tableBody += '<tr>'
    tableBody += '<td><input type="text" class="three columns" value="API Host" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-host" placeholder="'+ApiHost+'"></td>'
    tableBody += '</tr>'

    tableBody += '<tr>'
    tableBody += '<td><input type="text" class="three columns" value="API Path" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-path" placeholder="'+ApiPath+'"></td>'
    tableBody += '</tr>'

    tableBody += '<tr>'
    tableBody += '<td><input type="text" class="three columns" value="API User" readonly>'
    tableBody += '<input type="text" class="eight columns" id="api-user" placeholder="'+ApiUser+'"></td>'
    tableBody += '</tr>'

    // Generate the table buttons
    tableBody += '<tr>'
    tableBody += '<td><input type="button" class="two columns" value="Cancel"' + LightBlue + 'onclick="populateTableSettings(false)"> '
    tableBody += '<input type="button" class="two columns" value="Save"' + LightBlue + 'onclick="saveTableSettings()"></td>'
    tableBody += '</tr>'
  }

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
  showSettingsResults([])
}

// saves values then clears the settings table
function saveTableSettings() {

  // Save values from the table into the db
  let v = document.getElementById('api-key').value
  if (v != '') {
    encryptedString = Cryptr.encrypt(v)
    Database.update(SettingsDb, API_KEY, encryptedString)
    ApiKey = v
  }
  v = document.getElementById('api-host').value
  if (v != '') {
    Database.update(SettingsDb, HOST_KEY, v)
    ApiHost = v
  }
  v = document.getElementById('api-path').value
  if (v != '') {
    Database.update(SettingsDb, PATH_KEY, v)
    ApiPath = v
  }
  v = document.getElementById('api-user').value
  if (v != '') {
    Database.update(SettingsDb, USER_KEY, v)
    ApiUser = v
  }

  // Revert to closed settings section
  let tableBody = createTableSettingsButton('')
  document.getElementById('table-settings').innerHTML = tableBody
}

function createTableSettingsButton(selectedButton) {

  let updateColor = (selectedButton == 'orgs' ? DarkBlue : LightBlue)
  let changePwdColor = (selectedButton == 'pwd' ? DarkBlue : LightBlue)
  let settingsColor = (selectedButton == 'settings' ? DarkBlue : LightBlue)

  let tableBody = '<tr><td>'
  tableBody += '<input type="button" class="three columns" value="Update Orgs"' + updateColor + 'onclick="populateTableUpdateOrgs()">'
  tableBody += '<input type="button" class="three columns" value="Change Password"' + changePwdColor + 'onclick="populateTableChangePwd()">'
  tableBody += '<input type="button" class="three columns" value="Settings"' + settingsColor + 'onclick="populateTableSettings(true)">'
  tableBody += '</td></tr>'

  return tableBody
}

function populateTableChangePwd() {

  let tableBody = createTableSettingsButton('pwd')
  tableBody += '<tr><p> </p></tr>'
  tableBody += '<tr>'
  tableBody += '<input type="password" class="four columns" placeholder="Enter current password" id="pwd">'
  tableBody += '</tr>'
  tableBody += '<tr>'
  tableBody += '<input type="password" class="four columns" placeholder="Enter new password" id="npwd">'
  tableBody += '<input type="password" class="four columns" placeholder="Confirm new password" id="cpwd">'
  tableBody += '</tr>'

  tableBody += '<tr>'
  tableBody += '<td><input type="button" class="two columns" value="Cancel"' + LightBlue + 'onclick="populateTableSettings(false)"> '
  tableBody += '<input type="button" class="two columns" value="Change"' + LightBlue + 'onclick="changePassword()"></td>'
  tableBody += '</tr>'

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
  showSettingsResults([])

  // put cursor in text input
  let input = document.getElementById('pwd')
  input.focus()
}

function populateTableUpdateOrgs() {

  let tableBody = createTableSettingsButton('orgs')
  tableBody += '<tr><p> </p></tr>'
  tableBody += '<tr><td>'
  tableBody += '<input type="button" class="two columns" value="Open"' + LightBlue + 'onclick="handleOrgsOpen()">'
  tableBody += '<input type="text" class="nine columns" readonly value="'+OrgFileName+'"  placeholder="Click Open to select orgs file" id="orgfile">'
  tableBody += '</td></tr>'

  tableBody += '<tr><td>'
  tableBody += '<input type="button" class="two columns" value="Cancel"' + LightBlue + 'onclick="populateTableSettings(false)"> '
  tableBody += '<input type="button" class="two columns" value="Update"' + LightBlue + 'onclick="processOrgsFile()">'
  tableBody += '<input type="button" class="two columns" value="Erase"' + LightBlue + 'onclick="eraseOrgsFile()">'
  tableBody += '</td></tr>'

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
  showSettingsResults([Object.keys(Organizations).length+' orgs currently stored.'])
}

function handleOrgsOpen() {

  // Use system dialog to select file name
  const { dialog } = require('electron').remote
  promise = dialog.showOpenDialog()
  promise.then(
    result => handleOrgsOpenResult(result['filePaths'][0]),
    error => alert(error)
  )
}

function handleOrgsOpenResult(fileName) {

  OrgFileName = fileName
  populateTableUpdateOrgs()
}

function processOrgsFile() {

  if (OrgFileName.length == 0) {
    showSettingsResults(['Click Open to select orgs file'])
    return
  }

  // Open specified file
  try {
    var orgsWbk = Xlsx.readFile(OrgFileName)
  } catch (e) {
    populateTableResults([e.message])
    return
  }

  // Assume first sheet is the one
  const orgsSheetName = orgsWbk.SheetNames[0]
  const orgsSheet = orgsWbk.Sheets[orgsSheetName]
  const jOrgsSheet = Xlsx.utils.sheet_to_json(orgsSheet,{defval:''})

  try {
    var keys = Object.keys(jOrgsSheet[0])
  } catch (e) {
    populateTableResults(['The format of "'+OrgFileName+'" is invalid.','Please verify that it is a spreadsheet.'])
    return
  }

  // find dictionary entries for VAN ID and email address
  try {
    var emailKey = findHeaderInfo(keys, 'email', true)
    var vanIdKey = findHeaderInfo(keys, 'vanid')
  } catch (e) {
    showSettingsResults([e.message+' in ' + OrgFileName,'The header row should be the first row in the sheet.'])
    return
  }

  updateAndStoreOrganizations(jOrgsSheet, emailKey, vanIdKey)
  showSettingsResults([Object.keys(Organizations).length+' organizations saved.'])

  setTimeout(switchToAddrScreen, 1000);
}

function eraseOrgsFile() {

  Organizations = {}
  Database.drop(OrgsDb)

  showSettingsResults(['All organizations erased.'])

  setTimeout(switchToAddrScreen, 1000);
}

function augmentWorkbook(workbookName) {

  populateTableResults(['Working...'])
  document.getElementById('table-submain-results').innerHTML = ''

  // Open specified file
  try {
    var workbook = Xlsx.readFile(workbookName)
  } catch (e) {
    populateTableResults([e.message])
    return
  }

  // Assume first sheet is the one
  const sheetName = workbook.SheetNames[0]
  const xSheet = workbook.Sheets[sheetName]
  const jSheet = Xlsx.utils.sheet_to_json(xSheet,{defval:''})

  // Check if augmented sheet already exists
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    if (workbook.SheetNames[i] == sheetName+SheetSuffix) {
      populateTableResults(['Sheet "'+sheetName+SheetSuffix+'" already exists in the "'+workbookName+'" workbook. Please remove this sheet.'])
      return
    }
  }

  // Save original column order with VAN ID added in first column
  try {
    var keys = Object.keys(jSheet[0])
  } catch (e) {
    populateTableResults(['The format of "'+workbookName+'" is invalid.','Please verify that it is a spreadsheet.'])
    return
  }
  keys.unshift('VANID')

  // find dictionary entries for email address, first and last Names
  try {
    var emailKey = findHeaderInfo(keys, 'email')
    var firstNameKey = findHeaderInfo(keys, 'first name')
    var lastNameKey = findHeaderInfo(keys, 'last name')
  } catch (e) {
    populateTableResults([e.message+' in ' + workbookName,'The header row should be the first row in the sheet.'])
    return
  }

  let closure = {
    'wb': workbook,
    'wbn': workbookName,
    'shn': sheetName,
    'sht': jSheet,
    'k': keys,
    'tot': jSheet.length,
    'cnt': 0,
    'fnd': 0
  }

  MissingPersons = []
  PersonsFoundByEmail = []
  OrgsFound = []
  for (let i = 0; i < jSheet.length; i++) {
    lookupAndInsertVANID(jSheet[i], i, emailKey, firstNameKey, lastNameKey, writeNewWorkbook, closure)
  }
}

function writeNewWorkbook(closure) {

  let total = closure.tot

  if (++closure.cnt < total) {
    return
  }

  let workbook = closure.wb
  let workbookName = closure.wbn
  let sheetName = closure.shn
  let jSheet = closure.sht
  let keys = closure.k
  let found = closure.fnd

  const xNewSheet = Xlsx.utils.json_to_sheet(jSheet,{header:keys})
  try {
    Xlsx.utils.book_append_sheet(workbook, xNewSheet, sheetName+SheetSuffix)
    Xlsx.writeFile(workbook, workbookName)
  } catch (e) {
    populateTableResults([+e.message])
    return
  }

  AugmentResults = ['Created new "'+sheetName+SheetSuffix+'" sheet in '+workbookName+'.']
  AugmentResults.push('Added VAN IDs to '+found+' out of '+total+' rows.')
  let showButton = false
  if (MissingPersons.length > 0) {
    AugmentResults.push('&nbsp;'+MissingPersons.length+' persons not found.')
    showButton = true
  }
  if (PersonsFoundByEmail.length > 0) {
    AugmentResults.push('&nbsp;'+PersonsFoundByEmail.length+' persons found by email address only.')
    showButton = true
  }
  if (OrgsFound.length > 0) {
    AugmentResults.push('&nbsp;'+OrgsFound.length+' organizations found locally.')
    showButton = true
  }
  if (showButton) {
    AugmentResults.push('<td><input type="button" value="Show Details"' + LightBlue + 'onclick="showDetails()"></td>')
  }
  populateTableResults(AugmentResults)
}

function showDetails() {

  AugmentResults.pop()
  AugmentResults.push('<td><input type="button" value="Hide Details"' + LightBlue + 'onclick="hideDetails()"></td>')
  populateTableResults(AugmentResults)

  // Generate the table body
  let tableBody = ''
  if (MissingPersons.length > 0) {
    tableBody += '<tr ' + ErrorRow + '><th colspan="3">&nbsp;Missing Persons</th></tr>'
    for (let i = 0; i < MissingPersons.length; i++) {
      tableBody += MissingPersons[i]
    }
  }
  if (PersonsFoundByEmail.length > 0) {
    tableBody += '<tr ' + WarnRow + '><th colspan="3">&nbsp;Persons Found By Email Address Only</th></tr>'
    for (let i = 0; i < PersonsFoundByEmail.length; i++) {
      tableBody += PersonsFoundByEmail[i]
    }
  }
  if (OrgsFound.length > 0) {
    tableBody += '<tr ' + OkayRow + '><th colspan="3">&nbsp;Organizations Found Locally</th></tr>'
    for (let i = 0; i < OrgsFound.length; i++) {
      tableBody += OrgsFound[i]
    }
  }

  // Fill the table content
  document.getElementById('table-submain-results').innerHTML = tableBody
}

function hideDetails() {

  AugmentResults.pop()

  AugmentResults.push('<td><input type="button" value="Show Details"' + LightBlue + 'onclick="showDetails()"></td>')
  populateTableResults(AugmentResults)
  document.getElementById('table-submain-results').innerHTML = ''
}

function findHeaderInfo(keys, pattern, exact=false) {

  for (let i = 0; i < keys.length; i++) {
    if (exact && keys[i].length != pattern.length) {
      continue
    }
    if (keys[i].toLowerCase().indexOf(pattern) != -1) {
      return keys[i]
    }
  }

  throw {
    name:'File Format Error',
    message:'Could not locate '+pattern+' column in header row'
  }
}

function lookupAndInsertVANID(jRow, vanID, emailKey, firstNameKey, lastNameKey, fnc, closure) {

  let email = jRow[emailKey]
  let first = jRow[firstNameKey]
  let last = jRow[lastNameKey]

  // Look up email address for orgs first since it is local and fast
  if (email in Organizations) {
    let vid = Organizations[email]
    console.log('found org email locally: '+email+' with VANID '+vid)
    jRow['VANID'] = vid
    closure.fnd++
    insertStrangeVANID(OrgsFound, email, first, last)
    fnc(closure)
    return
  }

  // Must have at least email address for EveryAction find operation
  if (email.length == 0) {
    console.log('no email:'+first+' '+last)
    insertStrangeVANID(MissingPersons, '', first, last)
    fnc(closure)
    return
  }

  vanID = postRequest(email, first, last, function(vid) {

    if (vid == null) {
      console.log('not found: '+email)
      insertStrangeVANID(MissingPersons, email, first, last)
    } else {
      console.log('found: '+email+' with VANID '+vid)
      closure.fnd++
    }

    jRow['VANID'] = vid
    fnc(closure)
  })
}

function insertStrangeVANID(persons, email, first, last) {

  let tableRow = '<tr>'
  tableRow += '<td>'+first+'</td>'
  tableRow += '<td>'+last+'</td>'
  tableRow += '<td>'+email+'</td>'
  tableRow += '</tr>'
  persons.push(tableRow)
}

function postRequest(emailAddr, firstName, lastName, fnc) {

  let vanID = null

  // start by searching with first, last name and email address
  let firstTry = JSON.stringify({
    'firstName': firstName,
    'lastName': lastName,
    'emails': [ { 'email': emailAddr } ]
  })

  console.log('requesting: '+firstTry)
  postSingleRequest(firstTry, vanID => {

    // if first search failed, look by only email address
    if (vanID == null) {
      let secondTry = JSON.stringify({
        'emails': [ { 'email': emailAddr } ]
      })
      console.log('re-requesting: '+secondTry)
      postSingleRequest(secondTry, vanID => {
        if (vanID != null) {
          insertStrangeVANID(PersonsFoundByEmail, emailAddr, firstName, lastName)
        }
        fnc(vanID)
      })
    } else {
      fnc(vanID)
    }
  })
}

function postSingleRequest(data, fnc) {

  let vanID = null
  const username = ApiUser + ':' + ApiKey + '|1';

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

  const req = Https.request(options, res => {
    res.on('data', d => {
      try {
        const jd = JSON.parse(d)
        vanID = jd.vanId
        fnc(vanID)
      } catch (e) {
        console.log('bad json: '+firstName+' '+lastName+' '+emailAddr)
      }
    })
  })

  req.on('error', error => {
    alert(error)
  })

  req.write(data)
  req.end()
}

function storeOneOrg(k, e, v) {

  let val = {}
  val['email'] = e
  val['vanid'] = v
  let x = Cryptr.encrypt(JSON.stringify(val))
  Database.update(OrgsDb, k, x)
}

function storeOrganizations() {

  let i = 0
  Database.update(OrgsDb, 0, Object.keys(Organizations).length)
  for (let key in Organizations) {
    storeOneOrg(i+1, key, Organizations[key])
    i++
  }
  console.log('reencrypted orgs: '+Object.keys(Organizations).length)
}

function updateAndStoreOrganizations(orgs, emailKey, vanIdKey) {

  // Read orgs file, update in-memory hash and store in db
  for (let i = 0; i < orgs.length; i++) {
    let e = orgs[i][emailKey]
    let v = orgs[i][vanIdKey]

    Organizations[e] = v
  }

  storeOrganizations()
}

function loadOrganizations(fnc) {

  let orgCount = 0

  Database.get(OrgsDb, 0, function(docs) {
    if (docs[0].value > 0) {
      orgCount = docs[0].value
    }

    if (orgCount == 0) {
      fnc()
    }

    for (let i = 0; i < orgCount; i++) {
      Database.get(OrgsDb, i+1, function(docs) {
        if (docs[0].value.length > 0) {
          let encryptedOrg = docs[0].value
          try {
            let decryptedOrg = Cryptr.decrypt(encryptedOrg)
            org = JSON.parse(decryptedOrg)
          } catch (e) {
            alert(e.message)
            ThisWindow = ''
          }
          let e = org['email']
          let v = org['vanid']
          Organizations[e] = v

          let loaded = Object.keys(Organizations).length
          console.log(loaded+' loaded org: '+e+' with '+Organizations[e])

          if (loaded == orgCount) {
            fnc()
          }
        }
      })
    }
  })
}
