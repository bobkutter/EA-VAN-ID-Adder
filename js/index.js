const database = require('./js/database')
const xlsx = require('xlsx')
const Cryptr = require('cryptr')
var https = require('https')
var request = ''

let cryptr

var thisWindow

var settingsDb
var orgsDb

var organizations = {}

// Set before password is available
let encryptedApiKey = ''

// Set when correct password is entered
let password = ''
let apiKey = ''
let apiHost = ''
let apiPath = ''
let apiUser = ''

const shtSuffix = ' with VANIDs'

const lightBlue = ' style="background-color:#33C3F0;color:#FFF" '
const darkBlue = ' style="background-color:#3365f0;color:#FFF" '

// Use numbers rather than names to make db content less obvious
const API_KEY = '1'
const HOST_KEY = '2'
const PATH_KEY = '3'
const USER_KEY = '4'

// Global variables because I couldn't figure out how to pass arg to showMissingPersons
var augmentResults = []
var missingPersons = []

// Global variable because I couldn't figure out how to pass arg to updateOrgsFile
var orgFileName = ''

function validatePassword(passText, advice, decrypt=true) {

  //advice = []
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
    return false
  }

  if (decrypt)
  {
    // User entered valid string.
    cryptr = new Cryptr(passText)

    // If we have apiKey from previous uses, fetch it to test password decrypt
    if (encryptedApiKey.length > 0) {
      try {
        apiKey = cryptr.decrypt(encryptedApiKey)
      } catch (e) {
        advice.push('Invalid password: Could not authenticate.')
        return false
      }
    }
  }

  return true
}

window.onload = function() {

  thisWindow = window
  console.log('opening dbs')
  settingsDb = database.open('db/settings.db')
  orgsDb = database.open('db/orgs.db')

  // Fetch settings from previous uses
  database.get(settingsDb, API_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      encryptedApiKey = docs[0].value
    }
  })
  database.get(settingsDb, HOST_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      apiHost = docs[0].value
    }
  })
  database.get(settingsDb, PATH_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      apiPath = docs[0].value
    }
  })
  database.get(settingsDb, USER_KEY, function(docs) {
    if (docs[0].value.length > 0) {
      apiUser = docs[0].value
    }
  })

  populateTableMainWithPassword()
}

// Populates the main command table
function populateTableMainWithPassword() {

  // Generate the table body
  var tableBody = ''
  tableBody += '<tr>'
  tableBody += '<p>Must contain at least one number and one uppercase and lowercase letter, and at least 8 or more characters.</p>'
  tableBody += '</tr>'

  tableBody += '<tr>'
  tableBody += '<input type="password" class="four columns" placeholder="Enter password" id="password" pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}">'
  tableBody += '<input type="button"  class="two columns" id="submit" value="Submit"' + lightBlue + 'onclick="handleSubmittedPassword()">'
  tableBody += '</tr>'

  // Fill the table content
  document.getElementById('table-main').innerHTML = tableBody

  // put cursor in text input
  var input = document.getElementById('password')
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

  password = document.getElementById('password').value
  if (validatePassword(password, advice))
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
  if (currentPwd != password) {
    showSettingsResults(['Invalid password: could not authenticate current password.'])
    return
  }

  newPassword = document.getElementById('npwd')
  if (!validatePassword(newPassword.value, advice, false)) {
    showSettingsResults(advice)
    return
  }

  advice = []

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
  cryptr = new Cryptr(newPassword.value)
  let encryptedString = cryptr.encrypt(apiKey)
  database.update(settingsDb, API_KEY, encryptedString)
  password = newPassword.value

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
  var tableBody = '<tr>'
  tableBody += '<td><input type="button" class="two columns" value="Open"' + lightBlue + 'onclick="handleOpen()">'
  tableBody += '<input type="text" class="seven columns" value="'+fileName+'" placeholder="Click Open to select file" id="workbook">'
  tableBody += '<input type="button" class="three columns" value="Add VAN IDs"' + lightBlue + 'onclick="handleAugment()"></td>'
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
  document.getElementById('table-main-results').innerHTML = tableBody
}

// clears the results table
function clearTableResults() {

    // clear the table content
    document.getElementById('table-main-results').innerHTML = ''
}

// Populates the settings table
function populateTableSettings(all) {

  var pholder = ''
  if (apiKey != '') {
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
    tableBody += '<td><input type="button" class="two columns" value="Cancel"' + lightBlue + 'onclick="populateTableSettings(false)"> '
    tableBody += '<input type="button" class="two columns" value="Save"' + lightBlue + 'onclick="saveTableSettings()"></td>'
    tableBody += '</tr>'
  }

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
  showSettingsResults([])
}

// saves values then clears the settings table
function saveTableSettings() {

  // Save values from the table into the db
  var v = document.getElementById('api-key').value
  if (v != '') {
    encryptedString = cryptr.encrypt(v)
    database.update(settingsDb, API_KEY, encryptedString)
    apiKey = v
  }
  v = document.getElementById('api-host').value
  if (v != '') {
    database.update(settingsDb, HOST_KEY, v)
    apiHost = v
  }
  v = document.getElementById('api-path').value
  if (v != '') {
    database.update(settingsDb, PATH_KEY, v)
    apiPath = v
  }
  v = document.getElementById('api-user').value
  if (v != '') {
    database.update(settingsDb, USER_KEY, v)
    apiUser = v
  }

  // Revert to closed settings section
  let tableBody = createTableSettingsButton('')
  document.getElementById('table-settings').innerHTML = tableBody
}

function createTableSettingsButton(selectedButton) {

  let updateColor = (selectedButton == 'orgs' ? darkBlue : lightBlue)
  let changePwdColor = (selectedButton == 'pwd' ? darkBlue : lightBlue)
  let settingsColor = (selectedButton == 'settings' ? darkBlue : lightBlue)

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
  tableBody += '<td><input type="button" class="two columns" value="Cancel"' + lightBlue + 'onclick="populateTableSettings(false)"> '
  tableBody += '<input type="button" class="two columns" value="Change"' + lightBlue + 'onclick="changePassword()"></td>'
  tableBody += '</tr>'

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
  showSettingsResults([])

  // put cursor in text input
  var input = document.getElementById('pwd')
  input.focus()
}

function populateTableUpdateOrgs() {

  let tableBody = createTableSettingsButton('orgs')
  tableBody += '<tr><p> </p></tr>'
  tableBody += '<tr><td>'
  tableBody += '<input type="button" class="two columns" value="Open"' + lightBlue + 'onclick="handleOrgsOpen()">'
  tableBody += '<input type="text" class="nine columns" readonly value="'+orgFileName+'"  placeholder="Click Open to select orgs file" id="orgfile">'
  tableBody += '</td></tr>'

  tableBody += '<tr><td>'
  tableBody += '<input type="button" class="two columns" value="Cancel"' + lightBlue + 'onclick="populateTableSettings(false)"> '
  tableBody += '<input type="button" class="two columns" value="Update"' + lightBlue + 'onclick="processOrgsFile()">'
  tableBody += '<input type="button" class="two columns" value="Erase"' + lightBlue + 'onclick="eraseOrgsFile()">'
  tableBody += '</td></tr>'

  // Fill the table content
  document.getElementById('table-settings').innerHTML = tableBody
  showSettingsResults([Object.keys(organizations).length+' orgs currently stored.'])
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

  orgFileName = fileName
  populateTableUpdateOrgs()
}

function processOrgsFile() {

  if (orgFileName.length == 0) {
    showSettingsResults(['Click Open to select orgs file'])
    return
  }

  // Open specified file
  try {
    var orgsWbk = xlsx.readFile(orgFileName)
  } catch (e) {
    populateTableResults([e.message])
    return
  }

  // Assume first sheet is the one
  const orgsSheetName = orgsWbk.SheetNames[0]
  const orgsSheet = orgsWbk.Sheets[orgsSheetName]
  const jOrgsSheet = xlsx.utils.sheet_to_json(orgsSheet,{defval:''})

  try {
    var keys = Object.keys(jOrgsSheet[0])
  } catch (e) {
    populateTableResults(['The format of "'+orgFileName+'" is invalid.','Please verify that it is a spreadsheet.'])
    return
  }

  // find dictionary entries for VAN ID and email address
  try {
    emailKey = findHeaderInfo(keys, 'email', true)
    vanIdKey = findHeaderInfo(keys, 'vanid')
  } catch (e) {
    showSettingsResults([e.message+' in ' + orgFileName,'The header row should be the first row in the sheet.'])
    return
  }

  updateAndStoreOrganizations(jOrgsSheet, emailKey, vanIdKey)
  showSettingsResults([Object.keys(organizations).length+' organizations saved.'])

  setTimeout(switchToAddrScreen, 1000);
}

function eraseOrgsFile() {

  organizations = {}
  database.drop(orgsDb)

  showSettingsResults(['All organizations erased.'])

  setTimeout(switchToAddrScreen, 1000);
}

function augmentWorkbook(workbookName) {

  populateTableResults(['Working...'])
  document.getElementById('table-submain-results').innerHTML = ''

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
    lookupAndInsertVANID(jSheet[i], i, emailKey, firstNameKey, lastNameKey, writeNewWorkbook, closure)
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
    augmentResults.push('<td><input type="button" value="Show Missing Persons"' + lightBlue + 'onclick="showMissingPersons()"></td>')
  }
  populateTableResults(augmentResults)
}

function showMissingPersons() {

  augmentResults.pop()
  augmentResults.push('<td><input type="button" value="Hide Missing Persons"' + lightBlue + 'onclick="hideMissingPersons()"></td>')
  populateTableResults(augmentResults)

  // Generate the table body
  var tableBody = ''
  for (let i = 0; i < missingPersons.length; i++) {
    tableBody += missingPersons[i]
  }

  // Fill the table content
  document.getElementById('table-submain-results').innerHTML = tableBody
}

function hideMissingPersons() {

  augmentResults.pop()

  augmentResults.push('<td><input type="button" value="Show Missing Persons"' + lightBlue + 'onclick="showMissingPersons()"></td>')
  populateTableResults(augmentResults)
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

  var email = jRow[emailKey]
  var first = jRow[firstNameKey]
  var last = jRow[lastNameKey]

  // An organization might not have first/last name, only email
  if ((first.length == 0 || last.length == 0) && email in organizations) {
    vid = organizations[email]
    console.log('found org email locally: '+email+' with VANID '+vid)
    jRow['VANID'] = vid
    closure.fnd++
    fnc(closure)
    return
  }

  // Must have email, first and last name for EveryAction find operation
  if (email.length == 0 || first.length == 0 || last.length == 0) {
    console.log('skipped:'+first+' '+last+' '+email)
    insertMissingVANID(email, first, last)
    fnc(closure)
    return
  }

  vanID = postRequest(email, first, last, function(vid) {

    if (vid == null) {
      if (email in organizations) {
        vid = organizations[email]
        console.log('found org locally: '+email+' with VANID '+vid)
        closure.fnd++
      } else {
        console.log('not found: '+email)
        insertMissingVANID(email, first, last)
      }
    } else {
      console.log('found: '+email+' with VANID '+vid)
      closure.fnd++
    }

    jRow['VANID'] = vid
    fnc(closure)
  })
}

function insertMissingVANID(email, first, last) {

  let tableRow = '<tr>'
  tableRow += '<td>'+first+'</td>'
  tableRow += '<td>'+last+'</td>'
  tableRow += '<td>'+email+'</td>'
  tableRow += '</tr>'
  missingPersons.push(tableRow)
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

  console.log('requesting: '+emailAddr)
  const req = https.request(options, res => {
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
  x = cryptr.encrypt(JSON.stringify(val))
  database.update(orgsDb, k, x)
}

function storeOrganizations() {

  let i = 0
  database.update(orgsDb, 0, Object.keys(organizations).length)
  for (var key in organizations) {
    storeOneOrg(i+1, key, organizations[key])
    i++
  }
  console.log('reencrypted orgs: '+Object.keys(organizations).length)
}

function updateAndStoreOrganizations(orgs, emailKey, vanIdKey) {

  // Read orgs file, update in-memory hash and store in db
  for (i = 0; i < orgs.length; i++) {
    let e = orgs[i][emailKey]
    let v = orgs[i][vanIdKey]

    organizations[e] = v
  }

  storeOrganizations()
}

function loadOrganizations(fnc) {

  let orgCount = 0

  database.get(orgsDb, 0, function(docs) {
    if (docs[0].value > 0) {
      orgCount = docs[0].value
    }

    if (orgCount == 0) {
      fnc()
    }

    for (i = 0; i < orgCount; i++) {
      database.get(orgsDb, i+1, function(docs) {
        if (docs[0].value.length > 0) {
          let encryptedOrg = docs[0].value
          try {
            let decryptedOrg = cryptr.decrypt(encryptedOrg)
            org = JSON.parse(decryptedOrg)
          } catch (e) {
            alert(e.message)
            thisWindow = ''
          }
          let e = org['email']
          let v = org['vanid']
          organizations[e] = v

          let loaded = Object.keys(organizations).length
          console.log(loaded+' loaded org: '+e+' with '+organizations[e])

          if (loaded == orgCount) {
            fnc()
          }
        }
      })
    }
  })
}
