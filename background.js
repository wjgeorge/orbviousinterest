var rilBrowserAction = null, rilForeignRelations = null;
var ReadItLater = new ReadItLaterSingleton();

function getCurrentExtensionId()
{
   return chrome.i18n.getMessage('@@extension_id');
}

(function (enable)
{
   if (!enable)
   {
      return;
   }

   if (console._OrbviousInterestInitialized)
   {
      return;
   }

   var origFunctions = {
      'error': console.error,
      'log': console.log
   };

   console._OrbviousInterestInitialized = true;
   console._OrbviousInterestLogText = "";

   console.error = function(text)
   {
      if (console._OrbviousInterestLogText.length > 1000000)
      {
         console._OrbviousInterestLogText = console._OrbviousInterestLogText.substr(1000000);
      }

      console._OrbviousInterestLogText += text + "\r\n";
      return origFunctions.error.apply(this, arguments);
   };
   console.log = function(text)
   {
      if (console._OrbviousInterestLogText.length > 1000000)
      {
         console._OrbviousInterestLogText = console._OrbviousInterestLogText.substr(1000000);
      }
      
      console._OrbviousInterestLogText += text + "\r\n";
      return origFunctions.log.apply(this, arguments);
   };
})(false);

/* UI */

function updatePageActionForAllTabs() {
   rilBrowserAction.UpdateAllTabs();
}

/********* Listen for Events **************/

/* Build the message to send to Content Scripts when sending options */
function getOptionsMessageForContentScripts()
{
   var shortCutKey = localStorage['addUnreadShortCut'] ?
      JSON.parse(localStorage['addUnreadShortCut']) :
      { 'keycode': null, 'modifier': null };
   var googleReaderKey = localStorage['googleReaderShortCut'] ?
      JSON.parse(localStorage['googleReaderShortCut']) :
      { 'keycode': null, 'modifier': null };

   var contentScriptOptions =
   {
      'keycode': shortCutKey.keycode,
      'modifier': shortCutKey.modifier,
      'debug': (localStorage['debug'] == 1),
      'google-reader-integration':
         !(localStorage['integrateWithGoogleReader'] == 0),
      'google-reader-keycode' : googleReaderKey['keycode'],
      'google-reader-modifier' : googleReaderKey['modifier'],
   };

   return { 
      'message': 'reloadoptions',
      'options': JSON.stringify(contentScriptOptions)
   };
}

/* Custom messages to the extension */
var contentScriptPorts = [];
var delayedAddItem = null;
var timeOfLastPageLoad = (new Date()).getTime();
chrome.extension.onConnect.addListener(function (port)
{
   var debug = (localStorage['debug'] == '1');

   if (debug)
   {
      //console.log("Got port-connect request: " + JSON.stringify(port));
   }

   /* For content-scripts (which identify as such), we'll also save them all
    * in a "notification list", and they will get notified or changes to
    * options (or other relevant notification).
    */
   if (port.name && port.name == "content-script")
   {
      if (debug) { console.log("content script connected. Adding to list."); }

      if (localStorage['enableidlenessautorefresh'] == 1)
      {
         /* If more than 6 hours have passed since the last page-load, then
          * auto-refresh the list */
         var now = new Date();
         if ((now.getTime() - timeOfLastPageLoad) >= (1000 * 60 * 60 * 6))
         {
            ReadItLater.RefreshListFromServer(updatePageActionForAllTabs);
         }
         timeOfLastPageLoad = (new Date()).getTime();
      }

      contentScriptPorts.push(port);

      /* Send the shortcut options to the content script */
      if (debug) { console.log("Sending options to content script..."); }
      port.postMessage(getOptionsMessageForContentScripts());

      /* On disconnect, remove the port from the list */
      port.onDisconnect.addListener(function ()
      {
         var i = contentScriptPorts.indexOf(port)
         contentScriptPorts.splice(i, 1);
      });
   }
   /* Messages to the popup, mostly for the "onDisconnect" that gets fired when
    * the popup closes, so we can do post-closing cleanup. */
   else if (port.name == 'popup')
   {
      if (debug) { console.log("Popup port connected."); }
      port.onDisconnect.addListener(function ()
      {
         if (debug) { console.log("Popup port disconnected."); }

         if (delayedAddItem)
         {
            // The popup might have been closed while editing the tags of a
            // newly-added page. We still want to add the item, even if the user
            // didn't manage to save the tags.
            ReadItLater.SetAsUnread(delayedAddItem.url, delayedAddItem.title);
            delayedAddItem = null;
         }
      });

      port.onMessage.addListener(function (data)
      {
         if (!data) return;

         if (data.message == 'tagseditingdelayingadd' && data.url)
         {
            if (debug)
            {
               console.log("Delaying add of URL '" + data.url +
               "' while user edits the tags.");
            }

            delayedAddItem = { 'url': data.url, 'title': data.title };
         }
         else if (data.message == 'resolveMissingTitle' && data.url)
         {
            if (debug)
            {
               console.log("Resolving missing title of item being displayed by popup (url='" + data.url +
               "') while user edits the tags.");
            }

            ReadItLater.ResolveMissingTitle(data.url);
         }
         
      });
   }

   /* Listen for messages on all connecting ports */
   port.onMessage.addListener(function (data)
   {
      if (data && data.message == 'reloadoptions')
      {
         ReadItLater.reloadOptions();
         ReadItLater.RefreshListFromServer(updatePageActionForAllTabs);

         addOrRemoveContextMenus();

         /* Notify all the content scripts: reload the options */
         for (var i=0; i<contentScriptPorts.length; ++i)
         {
            if (contentScriptPorts[i])
            {
               contentScriptPorts[i].postMessage(
                  getOptionsMessageForContentScripts());
            }
         }
      }
      else if (data && data.message == 'copyAllItems')
      {
         ReadItLater.CopyAllItemsBetweenAccounts(data);
      }
      else if (data && data.message == 'scrollFromClosingPage')
      {
         if ((localStorage['rememberlastposition'] == 1) &&
              (data.url != null) &&
              (data.pageYOffset != null))
         {
            var percent = Math.floor(data.percent) || 0;

            ReadItLater.SavePageScrollPosition(
                  data.url,
                  data.pageYOffset,
                  percent);
         }
      }
      else if (data && data.message == 'pageLoaded')
      {
         if (localStorage['rememberlastposition'] == 1)
         {
            var scrollPos = ReadItLater.GetPageScrollPosition(data.url);
            if ((scrollPos != null) &&
                  typeof(scrollPos.pageYOffset) != 'undefined')
            {
               port.postMessage({
                  'message': 'scrollTo',
                  'pageYOffset': scrollPos.pageYOffset
               });
            }
         }
      }
      else
      {
         console.log(data.message);
      }
   });
});

function toggleCurrentTabUnread(responseCB)
{
   chrome.tabs.getSelected(null, function (currentTab)
   {
      /* define a callback to update the current tab if it's still
       * selected when we've finished updating the un/read state of
       * the item. */
      var cb = function (param)
      {
         chrome.tabs.getSelected(null, function (cbSelectedTab)
         {
            if (currentTab.id == cbSelectedTab.id)
            {
               updateContextMenuForSelectedTab();
            }
         });

         responseCB(param);
      };

      var state = ReadItLater.GetUrlState(currentTab.url);
      if (state == 0)
      {
         // Item already marked as "unread", mark it as "read"
         ReadItLater.SetAsRead(currentTab.url, cb);
      }
      else
      {
         // Item is unknown or marked as "read", mark it as "unread"
         ReadItLater.SetAsUnread(
            currentTab.url, currentTab.title, cb);
      }
   });
}

chrome.extension.onRequest.addListener(function(request, sender, responseCB)
{
   if (request)
   {
      if (request.command == 'refresh')
      {
         ReadItLater.RefreshListFromServer(function()
         {
            responseCB(ReadItLater.GetAllItemsByDate());
         });
      }
      else if (request.command == 'GetAllItemsByDate')
      {
         responseCB(ReadItLater.GetAllItemsByDate());
      }
      else if (request.command == 'markRead')
      {
         if (request.url)
         {
            var callback = function (result)
            {
               responseCB(ReadItLater.GetAllItemsByDate());
            }

            ReadItLater.SetAsRead(request.url, callback);
         }
      }
      else if (request.command == 'markUnread')
      {
         if (request.url && request.title)
         {
            var callback = function (result)
            {
               responseCB(ReadItLater.GetAllItemsByDate());
            }

            ReadItLater.SetAsUnread(request.url, request.title, callback);
         }
         else
         {
            responseCB(null); // failure!
         }
      }
      else if (request.command == 'deleteItem')
      {
         if (request.url)
         {
            var callback = function (result)
            {
               responseCB(ReadItLater.GetAllItemsByDate());
            }

            ReadItLater.DeleteItem(request.url, callback);
         }
         else
         {
            responseCB(null); // failure!
         }
      }      
      else if (request.command == 'markCurrentTabUnread')
      {
         chrome.tabs.getSelected(null, function (currentTab)
         {
            // If the user is actually adding the URL that's being delayed,
            // so there's no need to further delay the add.
            if (delayedAddItem && currentTab.url == delayedAddItem.url)
            {
               delayedAddItem = null;
            }

            ReadItLater.SetAsUnread(
               currentTab.url, currentTab.title, responseCB, request.tags);
         });
      }
      else if (request.command == 'addCurrentTabToUnreadIfPopupClosed')
      {
         chrome.tabs.getSelected(null, function (currentTab)
         {
            ReadItLater.SetAsUnread(
               currentTab.url, currentTab.title, responseCB, request.tags);
         });
      }
      else if (request.command == 'toggleCurrentTabUnread')
      {
         toggleCurrentTabUnread();
      }      
      else if (request.command == 'updateItem')
      {
         if (request.url && request.title)
         {
            var finalCallback = function (result)
            {
               responseCB(ReadItLater.GetAllItemsByDate());
            };

            var callback = function (result)
            {
               // If we've been passed tags too, then we must update them too
               if (request.tags != null)
               {
                  ReadItLater.UpdateItemTags(
                        request.url,
                        request.tags,
                        finalCallback);
               }
               else
               {
                  finalCallback(result);
               }
            }

            ReadItLater.UpdateItemTitle(request.url, request.title, callback);
         }
      }
      else if (request.command == 'insertContentCSS')
      {
         if (sender && sender.tab) 
         {
            insertContentCSSIntoTab(sender.tab);
         }
      }
      else if (request.command == 'getUrlState')
      {
         if (request.url && responseCB)
         {
            responseCB({
                  'url': request.url,
                  'state': ReadItLater.GetUrlState(request.url)
            });
         }
      }
      else if (request.command == 'textViewItem')
      {
         if (request.url && responseCB)
         {
            ReadItLater.GetTextOfUrl(request.url, function (pageText)
            {
               if (pageText != null)
               {
                  var textViewWindow = window.open("about:blank", "");
                  textViewWindow.document.body.innerHTML = pageText;
               }

               // Call the callback to close this request, but I don't have a
               // reason for calling a callback apart from that.
               responseCB();
            }, {'mode': 'more'});
         }         
      }
      else if (request.command == 'textViewItemUsingReadItLater')
      {
         if (request.url && responseCB)
         {
            ReadItLater.GetLinkToReadItLaterUrlTextView(
                  request.url,
                  function (url)
                  {
                     if (url != null)
                     {
                        var textViewWindow = window.open(url, "");
                     }

                     // Call the callback to close this request, but I don't
                     // have a reason for calling a callback apart from that.
                     responseCB();
                  });
         }
      }
      else if (request.command == 'getAllTags')
      {
         if (responseCB)
         {
            responseCB(ReadItLater.GetAllTags());
         }
      }      
   }
});

function showActionInProgressOnGUI(show)
{
   if (show)
   {
      rilBrowserAction.StartProgressAnimation();
   }
   else
   {
      rilBrowserAction.StopProgressAnimation();
   }
}

function contextMenuReadLaterOnClick (url, title, info, tab)
{
   var state = ReadItLater.GetUrlState(url);
   if (state && (state == 0 /* 0 means "unread" */))
   {
      ReadItLater.SetAsRead(url);
   }
   else
   {
      if (localStorage['askfortagsonadd'] != 1)
      {
         ReadItLater.SetAsUnread(url, title);
      }
      else
      {
         chrome.tabs.sendRequest(
               tab.id, {
                  'command': 'ORBVIOUS_ShowAddDialog',
                  'url': url,
                  'title': title
               });
      }
   }
}

var pageContextMenuId = null;
var linkContextMenuId = null;

/* Some websites, like facebook, wrap every external link with a redirect
 * script. We want to resolve those URLs into the actual external link */
function getActualUrl(url)
{
   /* As per Issue #111, all facebook links have URLs of
    * the form  "http://www.facebook.com/l.php?u=actual_link"
    * We actually want to store the "actual_link" */
   if (!url.indexOf)
   {
      console.log("url.indexOf is null, so we can't search the URL!");
      return;
   }

   /* Facebook */
   var prefix = "://www.facebook.com/l.php?u=";
   var pos = url.indexOf(prefix);
   if (pos == "http".length || pos == "https".length)
   {
      var link = url.substring(pos + prefix.length)
         ampPos = link.indexOf("&");
      if (ampPos > 0)
      {
         link = link.substring(0, ampPos);
      }
      url = unescape(link);
   }

   return url;
}

function addOrRemoveContextMenus()
{
   var handleCreateError = function()
   {
      if (chrome.extension.lastError && chrome.extension.lastError.length > 0)
      {
         console.error("Error creating context menu: " +
            chrome.extension.lastError);
      }
   };

   /* Note: Merely reloading background.js in the developer tools makes
    *       chrome.contextMenus.create() fail with "Unknown Error". */

   var pageMenuProperties = {
      'title': 'Save page to Read Later',
      'contexts': ['page'],
      'onclick': function (info, tab)
      {
         var url = info.pageUrl;
         var title = tab.title;

         // It's possible the right-click was from within a frame.
         // Use the frame's URL
         if (info.frameUrl)
         {
            url = info.frameUrl;
            title = info.frameUrl;
         }
         
         contextMenuReadLaterOnClick(url, title, info, tab)
      },
      'documentUrlPatterns': ['http://*/*', 'https://*/*']
   };

   /* Note that the code below is designed not to do anything when:
    * - We want the menu item, and it exists
    * - We don't want the menu item, and it doesn't exist. */
   var weWantPageContextMenu =
      (typeof(localStorage['contextmenupageitem']) == 'undefined') ||
      (localStorage['contextmenupageitem'] == 1);
   if (weWantPageContextMenu && (pageContextMenuId == null))
   {
      // We want the menu item, but it hasn't been created yet: create it
      pageContextMenuId = 
         chrome.contextMenus.create(pageMenuProperties, handleCreateError);      
   }
   else if ((!weWantPageContextMenu) && (pageContextMenuId != null))
   {
      // We don't want the menu item, and it exists: remove it
      chrome.contextMenus.remove(pageContextMenuId);
      pageContextMenuId = null;
   }

   var linkMenuProperties = {
      'title': 'Save link to Read Later',
      'contexts': ['link'],
      'onclick': function (info, tab)
      {
         // Sadly, info does not contain the text of the link, so we'll
         // ask the content script to get that for us
         chrome.tabs.sendRequest(
            tab.id,
            {
               'command': 'ORBVIOUS_GetAdditionalUrlInfo', 
               'url': info.linkUrl 
            },
            function (response)
            {
               if (!response)
               {
                  console.log("Got null response.");
                  return;
               }

               var url = getActualUrl(info.linkUrl);
               if (localStorage['debug'] == 1)
               {
                  console.log(
                     'Got response to ORBVIOUS_GetAdditionalUrlInfo' + 
                     '({url:' + url + '}): ' + JSON.stringify(response));
               }
               contextMenuReadLaterOnClick(url, response.text, info, tab)
            });
      },
      'targetUrlPatterns': ['http://*/*', 'https://*/*']
   };

   var weWantLinkContextMenu =
      (typeof(localStorage['contextmenulinkitem']) == 'undefined') ||
      (localStorage['contextmenulinkitem'] == 1);
   if (weWantLinkContextMenu && (linkContextMenuId == null))
   {
      // We want the menu item, but it hasn't been created yet: create it
      linkContextMenuId = 
         chrome.contextMenus.create(linkMenuProperties, handleCreateError);      
   }
   else if ((!weWantLinkContextMenu) && (linkContextMenuId != null))
   {
      // We don't want the menu item, and it exists: remove it
      chrome.contextMenus.remove(linkContextMenuId);
      linkContextMenuId = null;
   }
}

function updateContextMenuForSelectedTab()
{
   chrome.tabs.getSelected(null, function (tab)
   {
      var state = ReadItLater.GetUrlState(tab.url);

      if (pageContextMenuId != null)
      {
         chrome.contextMenus.update(
               pageContextMenuId,
               { 'title': ( (!(state == 0)) ? 
                  'Save to Read Later' : 'Mark page as Read' ) });
      }
   });
}

function insertContentCSSIntoTab(tab)
{
   var emptyImageUrl = chrome.extension.getURL('reader-unadded.png');
   var fullImageUrl = chrome.extension.getURL('reader-added.png');
   var emptyLoadingImageUrl =
      chrome.extension.getURL('reader-loading.gif');

   var cssCode =
      ".orbviousinteresticon " +
      "{ " +
      "  -webkit-user-select: none; " +
      "  display: inline-block; " +
      "  background: url('" + emptyImageUrl + "'); " +
      "  width: 16px; " +
      "  height: 16px; " +
      "  margin-left: 5px; " +
      "  margin-right: 3px; " +
      "  position: relative; " +
      "  left: -16px; " +
      "  z-index: 50; " +
      "  cursor: pointer; " +
      "} " +
      "\n" +
      // This is for the Reader's "list mode", to make room for the check-icon
      "#entries.list.single-source .entry > .collapsed > .entry-main > .entry-secondary " +
      "{ " +
      "  margin-left: 35px !important; " +
      "} " +
      "#entries.list .entry > .collapsed > .entry-main > .entry-source-title "+
      "{ " +
      "  margin-left: 23px !important; " +
      "} " +
      "#entries.list .entry > .collapsed > .entry-main > .entry-secondary > .entry-title " +
      "{ " +
      "  margin-left: 10px !important; " +
      "} " +
      "\n" +
      // This is for the Reader's "expanded mode", to make room for the icon
      "#entries.cards .entry-icons " +
      "{ " +
      "  width: auto; " +
      "} " +
      "\n" +
      ".orbviousinteresticon.unread " +
      "{ " +
      "  background: url('" + fullImageUrl + "'); " +
      "}" +
      "\n" +
      ".orbviousinteresticon.updating " +
      "{ " +
      "  background: url('" + emptyLoadingImageUrl + "'); " +
      "}"
      ;

   chrome.tabs.insertCSS(tab.id, { 'code': cssCode });
}

// Only display the request if the following is true:
// 1. The extension has been updated (the version is newer than the one
//    recorded in localStorage[])
// 2. We haven't displayed the request in the last two weeks.
function displayMoneyRequestOnlyOncePerFortnight()
{
   var fortnight = 1000*60*60*24*14;

   // Check if this is a newer version than the one already installed,
   // and if so - display the changelog to the user
   // Note: I orignally used "chrome.management" for this, but the "management"
   //       permission caused an outcry from the users. (This really sucked for
   //       me; some users accused me of invading their privacy and lying.
   //       So I'm using a hack instead of the correct method.)
   // Code based on Kinlan's answer to:
   // http://stackoverflow.com/questions/6436039
   //
   var manifestUrl = chrome.extension.getURL("manifest.json");
   var manifestXhr = new XMLHttpRequest();
   manifestXhr.onreadystatechange = function(e)
   {
      function showTab()
      {
         chrome.tabs.create({
            'selected': true,
            'url':
            'http://shalom.craimer.org/projects/orbviousinterest/update.php',
         });
      }

      function update(now, version)
      {
         localStorage['lastInstalled'] = JSON.stringify({
            'version': version,
            'date': now
         });         
      }

      if(manifestXhr.readyState == 4)
      {
         var manifest = JSON.parse(manifestXhr.responseText);

         // Read the last-installed information as best you can
         var lastInstalled = null;
         try
         {
            lastInstalled = JSON.parse(localStorage['lastInstalled']);
         }
         catch(e)
         {
            delete localStorage['lastInstalled'];
         }

         var now = new Date().getTime();
         if (!lastInstalled)
         {
            showTab();
            update(now, manifest.version);
         }
         else if (lastInstalled['version'] != manifest.version)
         {
            if ((now - lastInstalled['date']) > fortnight)
            {
               showTab();
               update(now, manifest.version);
            }
            else
            {
               // We don't want to display the request, since it's been
               // less than two weeks since the last request
               //
               // Futhermore, we don't want to update the date at which
               // we last showed the request, since we didn't show it.
               // However, we do want to update the version, so that this
               // same version doesn't trigger a display less than two weeks
               // after the last time we showed the request.
               update(lastInstalled['date'], manifest.version);
            }
         }
      }
   };
   manifestXhr.open("GET", manifestUrl);
   manifestXhr.send();
}

function onload() {
   rilBrowserAction = RILBrowserActionSingleton();
   rilForeignRelations = RILForeignRelationsSingleton();

   /* Context Menu */
   addOrRemoveContextMenus();
   // When the a new tab is selected, we must update the context menu
   chrome.tabs.onSelectionChanged.addListener(function(tabId, selectInfo)
   {
      updateContextMenuForSelectedTab();
   });
   chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab)
   {
      // if any tab other than the current one has been updated, we should not
      // update the context menu because there's only 1 instance of the menu,
      // and it should always reflect the state of the current tab
      chrome.tabs.getSelected(null, function (selectedTab)
      {
         if (selectedTab.id == tabId)
         {
            updateContextMenuForSelectedTab();
         }
      });
   });

   /* Fetch the initial list, and until it arrives, show an "in progress"
    * animation */
   chrome.tabs.getSelected(null, function (currentTab)
   {
      rilBrowserAction.SetIcon('browseraction-notadded.png', currentTab.id);
   });

   ReadItLater.RefreshListFromServer(function ()
   {
      // TODO: if the request failed with an error, then stop the progress
      //       animation with an error-icon

      updatePageActionForAllTabs();
   });

   displayMoneyRequestOnlyOncePerFortnight();
}

// Call onload() here since we can't do it inline in background.html anymore.
onload();

