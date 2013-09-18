var apiKey = "c3cp9T5fAb3e9L5391gf4d4G5bd3t308";
var usernameAndPasswordChecked = false;

function saveOptions()
{
   localStorage['debug'] = 
      document.getElementById('enabledebugging').checked ? 1 : 0;
   localStorage['itemsPerPage'] = 
      document.getElementById('itemsPerPage').value;
   localStorage['askfortagsonadd'] = 
      document.getElementById('askfortagsonadd').checked ? 1 : 0;
   localStorage['integrateWithGoogleReader'] =
      document.getElementById('googlereaderintegration').checked ? 1 : 0;
   localStorage['showUnreadCountBadge'] =
      document.getElementById('showunreadcountbadge').checked ? 1 : 0;
   localStorage['indicateWhenRead'] =
      document.getElementById('indicatewhenread').checked ? 1 : 0;
   localStorage['contextmenupageitem'] =
      document.getElementById('contextmenupageitem').checked ? 1 : 0;
   localStorage['contextmenulinkitem'] =
      document.getElementById('contextmenulinkitem').checked ? 1 : 0;
   localStorage['rememberlastposition'] =
      document.getElementById('rememberlastposition').checked ? 1 : 0;
   localStorage['enableidlenessautorefresh'] =
      document.getElementById('enableidlenessautorefresh').checked ? 1 : 0;
   localStorage['showdeleteinpopup'] =
      document.getElementById('showdeleteinpopup').checked ? 1 : 0;
   localStorage['showdateinpopup'] =
      document.getElementById('showdateinpopup').checked ? 1 : 0;
   localStorage['markunreaditemsasread'] =
      document.getElementById('markunreaditemsasread').checked ? 1 : 0;
   localStorage['openitemswithoutclosingpopup'] =
      document.getElementById('openitemswithoutclosingpopup').checked ? 1 : 0;

   /* Save the shortkey key options, which are more complicated: */

   /* Global add-this-page shortcut */
   if (document.getElementById('addunreadshortcutkeyenabled').checked)
   {
      var keyElem = document.getElementById('addunreadshortcutkey');
      var keyCode = keyElem.value.toUpperCase().charCodeAt(0);
      var modifierElement =
         document.getElementById('addunreadshortcutkeymodifier');
      var keyModifier = 
         modifierElement.options[modifierElement.selectedIndex].value;

      localStorage['addUnreadShortCut'] = JSON.stringify({
            'keycode': keyCode,
            'modifier': keyModifier
            });
   }
   else
   {
      delete localStorage['addUnreadShortCut'];
   }

   /* Google Reader integrated shortcut */
   if (document.getElementById('googlereaderkeyenable').checked)
   {
      var keyElem = document.getElementById('googlereaderkeycode');
      var keyCode = keyElem.value.toUpperCase().charCodeAt(0);
      var modifierElement =
         document.getElementById('googlereaderkeymodifier');
      var keyModifier = 
         modifierElement.options[modifierElement.selectedIndex].value;

      localStorage['googleReaderShortCut'] = JSON.stringify({
            'keycode': keyCode,
            'modifier': keyModifier
            });
   }
   else
   {
      delete localStorage['googleReaderShortCut'];
   }   

   // notify the extension to reload the options
   var port = chrome.extension.connect();
   port.postMessage({message: "reloadoptions"});

   // Update status to let user know options were saved.
   setStatus("Options Saved.", false, 750);
}

function setStatus(text, error, timeout)
{
   var status = document.getElementById("status");
   status.innerHTML = text;
   status.style.display = 'block';
   status.className = error ? 'error' : '';
   if (typeof(timeout) != "undefined")
   {
      setTimeout(function()
      {
         status.style.display = 'none';
      }, timeout);
   }
}
    
opt = {
   'debug': { 
      'name': 'debug', 'elem': 'enabledebugging',
      'type': 'bool-1-0', 'default': 0 },
   'itemsPerPage': {
      'name': 'itemsPerPage', 'elem': 'itemsPerPage',
      'type': 'int', 'default': 8 },
   'askfortagsonadd': {
      'name': 'askfortagsonadd', 'elem': 'askfortagsonadd',
      'type': 'bool-1-0', 'default': 0 },
   'integrateWithGoogleReader': {
      'name': 'integrateWithGoogleReader', 'elem': 'googlereaderintegration',
      'type': 'bool-1-0', 'default': 1 },   
   'showUnreadCountBadge': {
      'name': 'showUnreadCountBadge', 'elem': 'showunreadcountbadge',
      'type': 'bool-1-0', 'default': 1 },   
   'indicateWhenRead': {
      'name': 'indicateWhenRead', 'elem': 'indicatewhenread',
      'type': 'bool-1-0', 'default': 0 },   
   'contextmenupageitem': {
      'name': 'contextmenupageitem', 'elem': 'contextmenupageitem',
      'type': 'bool-1-0', 'default': 1 },   
   'contextmenulinkitem': {
      'name': 'contextmenulinkitem', 'elem': 'contextmenulinkitem',
      'type': 'bool-1-0', 'default': 1 },   
   'rememberlastposition': {
      'name': 'rememberlastposition', 'elem': 'rememberlastposition',
      'type': 'bool-1-0', 'default': 1 },   
   'enableidlenessautorefresh': {
      'name': 'enableidlenessautorefresh', 'elem': 'enableidlenessautorefresh',
      'type': 'bool-1-0', 'default': 1 },   
   'showdeleteinpopup': {
      'name': 'showdeleteinpopup', 'elem': 'showdeleteinpopup',
      'type': 'bool-1-0', 'default': 0 },   
   'showdateinpopup': {
      'name': 'showdateinpopup', 'elem': 'showdateinpopup',
      'type': 'bool-1-0', 'default': 0 },   
   'markunreaditemsasread': {
      'name': 'markunreaditemsasread', 'elem': 'markunreaditemsasread',
      'type': 'bool-1-0', 'default': 0 },   
   'openitemswithoutclosingpopup': {
      'name': 'openitemswithoutclosingpopup',
      'elem': 'openitemswithoutclosingpopup',
      'type': 'bool-1-0', 'default': 0 },   
};

function saveAnotherAutoGeneratedUser(username)
{
   /* We want to add to the existing list, if it exists. */
   var existing = localStorage['savedAutoGeneratedUsernames'] || "[]";
   try {
      existing = JSON.parse(existing);
      if (!(existing instanceof Array))
      {
         existing = [];
      }
   }
   catch (ex) {
      existing = [];
   }

   existing.push({'username': username});
   localStorage['savedAutoGeneratedUsernames'] = JSON.stringify(existing);
}

function loadOptions()
{
   console.log("Orbvious Interest's Read It Later username: '" + 
         localStorage['username'] + "'");
   if (localStorage['username'])
   {
      document.getElementById('username').value = localStorage['username'];

      console.log('Orbvious Interest is ' + 
            (localStorage['authchecked']==1 ? '' : 'not') + ' authenticated.');
      $('#checkAuth').attr('disabled', false);
      if (localStorage['authchecked'] == 1)
      {
         usernameAndPasswordChecked = (localStorage['authchecked'] == 1);
         document.getElementById('password').value = localStorage['password'];
         $('#checkAuth').attr('disabled', true).text('Signed In');
      }
      else
      {
         usernameAndPasswordChecked = false;
         document.getElementById('password').value = '';
      }
   }

   // Note: I removed the user-autogeneration code becuase I was asked by
   //       Justin of the support at GetPocket.com

   for (var i in opt)
   {
      var name = (opt[i] && opt[i].name) ? opt[i].name : null;
      var val = (name && localStorage[name]) ? localStorage[name] : null;

      if (opt[i].type == 'bool-1-0')
      {
         val = (val != null) ? (val == 1) : (opt[i].default == 1);
         document.getElementById(opt[i].elem).checked = val;
      }
      else if (opt[i].type == 'int')
      {
         val = (val != null) ? val : opt[i].default;
         document.getElementById(opt[i].elem).value = val;         
      }
   }

   if (localStorage['addUnreadShortCut'])
   {
      document.getElementById('addunreadshortcutkeyenabled').checked = true;

      var shortcut = JSON.parse(localStorage['addUnreadShortCut']);

      document.getElementById('addunreadshortcutkey').value = 
         String.fromCharCode(shortcut['keycode']);

      var modifier = document.getElementById('addunreadshortcutkeymodifier');
      for (var i=0; i<modifier.options.length; ++i)
      {
         if (modifier.options[i].value == shortcut['modifier'])
         {
            modifier.selectedIndex = i;
            break;
         }
      }
   }
   else 
   {
      document.getElementById('addunreadshortcutkeyenabled').checked = false;
   }
 
   if (localStorage['googleReaderShortCut'])
   {
      document.getElementById('googlereaderkeyenable').checked = true;

      var shortcut = JSON.parse(localStorage['googleReaderShortCut']);

      document.getElementById('googlereaderkeycode').value = 
         String.fromCharCode(shortcut['keycode']);

      var modifier = document.getElementById('googlereaderkeymodifier');
      for (var i=0; i<modifier.options.length; ++i)
      {
         if (modifier.options[i].value == shortcut['modifier'])
         {
            modifier.selectedIndex = i;
            break;
         }
      }
   }
   else 
   {
      document.getElementById('googlereaderkeyenable').checked = false;
   }
}

function checkAuthentication(username, password, callback) {
    var xhr = new XMLHttpRequest();

    try {
        console.log("Sending request...");

        // Set a timer to give up after 5 seconds
        var timerId = window.setTimeout(function() {
                    console.log("aborted auth after 5 seconds");
                    xhr.abort();
                    if (callback) {
                        callback(false);
                    }
                }, 5000);    

        xhr.onreadystatechange = function() {
            if ((xhr.readyState == 4)) {
                var authgood = false;

                authgood = (xhr.status == 200);
                if (xhr.responseText) {
                    console.log("Got response: " + xhr.responseText);
                    window.clearTimeout(timerId);
                }

                try {
                   if (callback) {
                      callback(authgood);
                   } 
                }
                catch (e)
                {
                   alert('exception: ' + e);
                }
            }
        }

        xhr.onerror = function(error) {
            console.log("error: " + error);
        }

        var url = "https://readitlaterlist.com/v2/auth?" + jQuery.param(
                {'username': username, 'password': password, 'apikey': apiKey});
        xhr.open("GET", url, true);
        xhr.send(null);
    } 
    catch (e) 
    {
        console.log("ex: " + e);
        console.error("exception: " + e);
    }   
}

function checkUsernamePassword()
{
   $('#checkAuth').attr('disabled', true).text("Checking...");
   checkAuthentication(
      document.getElementById('username').value,
      document.getElementById('password').value,
      function(auth)
      {
         console.log('Checked username and password. ' +
            'They are' + (auth ? '' : ' not') + ' authenticated.');

         if (auth)
         {
            saveUsernameAndPassword();
         }

         setTimeout(function()
         {
            $('#checkAuth').text(auth ?
               "Username/password are good." : "Invalid username/password.");

            if (auth)
            {
               // Hide the button
               setTimeout(function() {
                  $('#checkAuth').text("Signed In").attr('disabled',true);
               }, 2000);
            }
            else
            {
               // Disable the button and then revert it
               setTimeout(function() {
                  $('#checkAuth').text("Sign In").attr('disabled', false);
               }, 2000);
            }

            if (auth)
            {
               if (localStorage['autoGeneratedUsername'] == 1)
               {
                  var copyPages = confirm("You've added pages to be read to the current account.\nThat account was automatically generated, and probably not your real account.\nWould you like to copy the pages you've saved to the account with the username you just gave?\n(Recommendation: Yes. Press OK.)");
                  if (copyPages)
                  {
                     copyPagesFromAutoGeneratedAccountToNewAccount(
                        localStorage['username'],
                        localStorage['password'],
                        document.getElementById('username').value,
                        document.getElementById('password').value);
                  }
               }
               saveUsernameAndPassword();
            }
         }, 750);
      });
}

function copyPagesFromAutoGeneratedAccountToNewAccount(
      oldUsername, oldPassword, newUsername, newPassword)
{
   var port = chrome.extension.connect();
   port.postMessage(
      {
         'message': "copyAllItems",
         'sourceUsername': oldUsername,
         'sourcePassword': oldPassword,
         'destinationUsername': newUsername,
         'destinationPassword': newPassword
      });
}

function saveUsernameAndPassword()
{
   localStorage['username'] = document.getElementById('username').value;
   localStorage['password'] = document.getElementById('password').value;
   localStorage['autoGeneratedUsername'] = 0;
   localStorage['authchecked'] = 1;

   // notify the extension to reload the options
   var port = chrome.extension.connect();
   port.postMessage({message: "reloadoptions"});

   console.log('Saved username and password.');
}

function authMaybeChanged() {
    usernameAndPasswordChecked = 
        (localStorage['authchecked'] == 1)
        &&
        (document.getElementById('username').value == localStorage['username'])
        &&
        (document.getElementById('password').value == localStorage['password']);

   if (!usernameAndPasswordChecked)
   {
      $('#checkAuth').text('Sign In').attr('disabled',false);
   }
   else
   {
       $('#checkAuth').text('Signed In').attr('disabled', true);
   }
}

function activateTab(target)
{
   if (!target.hasClass('active'))
   {
      jQuery('#tabs .active').removeClass('active');
      target.addClass('active');
      jQuery('#content .active').removeClass('active');
      jQuery('#' + target.attr('rel')).addClass('active');

      // Special case for the Authentication, that does its own saving
      if (target.attr('rel') == 'authentication')
      {
         $('#save').hide();
      }
      else
      {
         $('#save').show();
      }
   }   
}

function init()
{
   loadOptions();

   jQuery('#tabs li').click(function (evtObj)
   {
      activateTab($(evtObj.target));
   });

   if (localStorage['authchecked'] != 1)
   {
      activateTab($('li[rel="authentication"]'));
   }

   document.getElementById('username').addEventListener('change', authMaybeChanged);
   document.getElementById('password').addEventListener('change', authMaybeChanged);
   document.getElementById('checkAuth').onclick = checkUsernamePassword;
   document.getElementById('save').onclick = saveOptions;
}

jQuery(function() { init(); });
