var ShortcutKeyContentScript = (function()
{
   var keycode = null, modifier = null;
   var debug = false;
   var port = null;

   function keyupHandler(evtObj)
   {
      var observedModifier =
         (evtObj.ctrlKey  ? 1 : 0) +
         (evtObj.altKey   ? 2 : 0) +
         (evtObj.shiftKey ? 4 : 0) + 
         (evtObj.metaKey  ? 8 : 0);

      if ((observedModifier == modifier) && (evtObj.keyCode == keyCode))
      {
         chrome.extension.sendRequest(
            {'command': 'toggleCurrentTabUnread'},
            function (success) {
               // I can't think of anything to do after this
            });

         evtObj.preventDefault();
         evtObj.stopPropagation();
         evtObj.cancelBubble = true;

         return false;
      }
   }

   function attachHandler()
   {
      if (debug) { console.log("attachHandler()"); }

      if (keyCode && modifier)
      {
         if (debug) { console.log("attachHandler: keyCode && modifier"); }

         document.addEventListener('keyup', keyupHandler, false);
      }
   }

   function detachHandler()
   {
      if (debug) { console.log("detachHandler()"); }

      document.removeEventListener('keyup', keyupHandler, false);
   }

   function reloadOptions(options)
   {
      if (debug) { console.log("reloadOptions(" + options + ")"); }

      if (options)
      {
         if (debug) { console.log("reloadOptions: options set"); }

         var shortcut = JSON.parse(options);
         keyCode = shortcut['keycode'];
         modifier = shortcut['modifier'];
         debug = shortcut['debug'];
      }
      else
      {
         if (debug) { console.log("reloadOptions: options unset"); }

         keyCode = null;
         modifier = null;
         debug = false;
      }

      if (keyCode && modifier)
      {
         attachHandler();
      }
      else
      {
         detachHandler();
      }
   }

   function init()
   {
      /* Connect to the background page so that we get updated if the user
       * changes his shortcut key.
       * The mere act of connecting also triggers the background page to
       * send us the shortcut key options. */

      port = chrome.extension.connect({"name": "content-script"});
      port.onMessage.addListener(function(data)
      {
         if (data.message && data.message == 'reloadoptions')
         {
            if (debug)
            {
               console.log("got message 'reloadoptions': " +
                     JSON.stringify(data.options));
            }

            reloadOptions(data.options);
         }
      });
   }

   /* return a function so that "new" has a function to instantiate.
    * Since the function was part of this closure, the closure will
    * remain alive. */
   return function ()
   {
      init();

      return {
         ReloadOptions: reloadOptions
      };
   };

})();

/* ------------------------------------------------------------------------ */

var GoogleReaderContentScript = (function()
{
   var debug = false;
   var enabled = true;
   var port = null;

   var grKeyCode = null, grKeyModifier = null;

   function reloadOptions(options)
   {
      if (debug) { console.log("reloadOptions(" + options + ")"); }

      if (options)
      {
         if (debug) { console.log("reloadOptions: options set"); }

         try
         {
            var config = JSON.parse(options);
            if (typeof(config['google-reader-integration']) != 'undefined')
            {
               enabled = config['google-reader-integration'];
            }
            else
            {
               enabled = true;
            }
            if (typeof(config['debug']) != 'undefined')
            {
               debug = config['debug'];
            }
            else
            {
               debug = false;
            }

            grKeyCode = config['google-reader-keycode'];
            grKeyModifier = config['google-reader-modifier'];
         }
         catch (e)
         {
            console.error("Exception while reloading options: " + e);
         }
      }
      else
      {
         if (debug) { console.log("reloadOptions: options unset"); }

         enabled = true;
         debug = false;
      }

     if ((grKeyModifier != null) && (grKeyCode != null))
      {
         attachGrKeyHandler();
      }
      else
      {
         detachGrKeyHandler();
      }      
   }

   function isPageGoogleReader()
   {
      /* We have to match URLs like these:
       *    http://reader.google.com
       *    https://reader.google.com
       *    http://www.google.com/reader/
       *    https://www.google.com/reader/
       *    http://reader.google.com.tw
       *    http://www.google.com.tw/reader/
       *    http://reader.google.co.il
       *    http://www.google.co.il/reader/
       */

      var isReaderDotGoogle = /^http(:?s?):\/\/reader\.google\./;
      var isGoogleSlashReader =
         /^http(:?s?):\/\/www\.google\.[^\/]+\/reader\//;
      var url = location.href;
      if (url.match(isReaderDotGoogle) || url.match(isGoogleSlashReader))
      {
         return true;
      }

      return false;
   }

   function postConfigInit()
   {
      if (!enabled)
      {
         return false;
      }

      requestCssInsert();
      listenForEntryInserts();
   }

   function init()
   {
      if (!isPageGoogleReader())
      {
         if (debug)
         {
            console.log("Content script thinks that '" + location.href +
                  "' is not a Google Reader page.");
         }

         // Don't bother setting up the Google Reader integration; this isn't
         // Google Reader.
         return false;
      }

      /* Connect to the background page so that we get updated if the user
       * changes his preferences.
       * The mere act of connecting also triggers the background page to
       * send us the options. */
      if (debug) { console.log("Asking background page for options..."); }

      port = chrome.extension.connect({"name": "content-script"});
      port.onMessage.addListener(function(data)
      {
         if (data.message && data.message == 'reloadoptions')
         {
            if (debug)
            {
               console.log("got message 'reloadoptions': " +
                     JSON.stringify(data.options));
            }

            reloadOptions(data.options);
            postConfigInit();
         }
      });
   }

   function requestCssInsert()
   {
      chrome.extension.sendRequest(
         {'command': 'insertContentCSS'},
         function (success) {
            if (debug)
            {
               console.log(succses ?
                  "requestCssInsert: Inserted CSS successfully." :
                  "requestCssInsert: Failure during CSS insertion.");
            }
         });
   }

   function iconClickEventHandler(eventObject)
   {
      var icon = $(eventObject.target);
      toggleGoogleReaderEntry(icon);
   }

   function toggleGoogleReaderEntry(icon /* the DOM-node of the icon */)
   {
      var main = icon.parents('.entry');
      var url = icon.attr('href');
      var title = main.find('.entry-title').text();

      var isUnread = icon.hasClass('unread');
      var command = isUnread ? 'markRead' : 'markUnread';

      // set the animation to run
      if (isUnread)
      {
         icon.removeClass('unread');
      }
      icon.addClass('updating');
      // Just in case, stop the animation after 10 seconds and revert
      var revertTimeout = window.setTimeout(function () 
      {
         icon.removeClass('updating');
         if (isUnread)
         {
            icon.addClass('unread');
         }
      }, 10000);

      chrome.extension.sendRequest(
         {'command': command, 'url': url, 'title': title},
         function (success) {
            window.clearTimeout(revertTimeout);

            // done updating
            icon.removeClass('updating');
            // if it's become unread, mark it as such
            if (!isUnread)
            {
               icon.addClass('unread');
            }
         }
      );
   }

   function listenForEntryInserts()
   {
      if (debug)
      {
         console.log("listening for DOMNodeInserted on #entries");
      }

      var entries = jQuery('#entries');
      entries.bind('DOMNodeInserted',
            function(evtObj) { handleNewlyInsertedNode(evtObj); });
      entries.find('.entry').each(function (index, value)
      {
         insertIconInNewlyInsertedEntry($(value), true);
      });
   }

   function insertIconInNewlyInsertedEntry(entry, usejQuery)
   {
      if (entry.hasClass('orbviousinterest_marked'))
      {
         if (debug)
         {
            console.log(
                  "Entry has already been marked as inserted with icon.");
         }
         return;
      }
      else if (entry[0].firstChild == null)
      {
         if (debug)
         {
            console.log("Entry has no children and will be ignored." +
                 " Probably an .entry in the expanded display mode.");
         }
         return;
      }
      else
      {
         if (debug)
         {
            console.log("Inserting icon into newly inserted entry...");
         }
      }

      /* Try finding the element with an 'href' attribute that has the URL
       * of the page. */
      var entryLink = entry.find('.entry-title-link');
      if (entryLink.length == 0)
      {
         entryLink = entry.find('.entry-original');
      }

      if (debug)
      {
         console.log("find('.entry-title-link') = " + entryLink.html());
      }

      var url = null;
      if (entryLink != null && entryLink.length > 0)
      {
         url = entryLink[0].href;

         if (debug)
         {
            console.log("Found URL=" + url);
         }
      }
      else
      {
         if (debug)
         {
            console.log("Could not find entryLink with an href, in the entry: '" + entry.html() + "'");
         }
      }

      var insertionSearchList = [
         '.entry-icons'
      ];
      var insertInsideElement = null;
      for (var i=0; i<insertionSearchList.length; ++i)
      {
         insertInsideElement = entry.find(insertionSearchList[i]);

         // Only considered the right item if it exists and it's displayed
         if ((insertInsideElement.length == 1) && 
               (insertInsideElement.css("display") != "none"))
         {
            break;
         }
         else
         {
            insertInsideElement = null;
         }
      }

      if (debug)
      {
            console.log("insertInsideElement = " + insertInsideElement.html());
      }

      if (insertInsideElement == null)
         return;

      if (debug)
      {
         console.log("Getting state of URL (" + url + ")");
      }

      chrome.extension.sendRequest(
         {'command': 'getUrlState', 'url': url },
         function (stateObj)
         {
            if (debug)
            {
               console.log("URL State = " + JSON.stringify(stateObj));
            }

            var icon = document.createElement('div');
            icon.className = 'orbviousinteresticon' + 
               ((stateObj && stateObj.state == 0) ? ' unread' : '');
            icon.setAttribute('href', url);
            insertInsideElement[0].appendChild(icon);
            icon = $(icon);

            /* Add a click-event to the icon, to toggle the read/unread */
            if (!icon.hasClass('clickable'))
            {
               icon.bind('click', function(evtObj)
                     {
                     iconClickEventHandler(evtObj);

                     evtObj.preventDefault();
                     evtObj.stopPropagation();
                     evtObj.cancelBubble = true;               
                     return false;
                     });
               icon.addClass('clickable');
            }
            entry.addClass('orbviousinterest_marked');
         });
   }

   function handleNewlyInsertedNode(evtObj)
   {
      if (debug)
      {
         console.log("DOMNodeInserted fired");
      }

      var target = $(evtObj.target);
      if (target.hasClass('entry'))
      {
         if (debug)
         {
            console.log("Inserted node has class 'entry'");
         }

         insertIconInNewlyInsertedEntry(target);
      }
      else if (target.hasClass('entry-container'))
      {
         if (debug)
         {
            console.log("Inserted node has class 'entry-container'");
         }

         insertIconInNewlyInsertedEntry(target);
      }
   }

   function grKeyupHandler(evtObj)
   {
      var observedModifier =
         (evtObj.ctrlKey  ? 1 : 0) +
         (evtObj.altKey   ? 2 : 0) +
         (evtObj.shiftKey ? 4 : 0) +
         (evtObj.metaKey  ? 8 : 0);

      if ((observedModifier == grKeyModifier) &&
            (evtObj.keyCode == grKeyCode))
      {
         if (evtObj.srcElement.tagName.toLowerCase() == 'input')
         {
            if (debug) 
            {
               console.log("Orbvious Interest's Google Reader keyboard " + 
                     "shortcut was pressed in while focus was in an INPUT " +
                     "element. The keypress has been ignored.");
            }
            return;
         }

         var currentIcon = $('#current-entry .orbviousinteresticon');
         if (currentIcon.length == 1)
         {
            toggleGoogleReaderEntry(currentIcon);
         }
         else if (currentIcon.length > 0)
         {
            if (debug)
            {
               console.log("There are " + currentIcon.length +
                     " items for '#current-entry .orbviousinteresticon'");
            }
         }

         evtObj.preventDefault();
         evtObj.stopPropagation();
         evtObj.cancelBubble = true;

         return false;
      }
   }

   function attachGrKeyHandler()
   {
      if (debug) { console.log("attachGrKeyHandler()"); }

      if ((grKeyModifier != null) && (grKeyCode != null))
      {
         if (debug) { console.log(
               "attachGrKeyHandler: grKeyModifier && grKeyCode"); }

         document.addEventListener('keyup', grKeyupHandler, false);
      }
   }

   function detachGrKeyHandler()
   {
      if (debug) { console.log("detachGrKeyHandler()"); }

      document.removeEventListener('keyup', grKeyupHandler, false);
   }   

   /* return a function so that "new" has a function to instantiate.
    * Since the function was part of this closure, the closure will
    * remain alive. */
   return function ()
   {
      init();

      return {
         ReloadOptions: reloadOptions
      };
   };

})();

/* ------------------------------------------------------------------------ */

var ScrollSavingContentScript = (function()
{
   var debug = false;
   var port = null;
   var pageYOffset = null, percent = null;

   function saveScrollPosition(evtObj)
   {
      pageYOffset = window.pageYOffset;
      percent = 100 * (
         Math.ceil(window.pageYOffset + window.innerHeight) / 
            document.body.scrollHeight
         );
   }

   function notifyBackgroundPageThatPageHasLoaded(evtObj)
   {
      port.postMessage({
         'message': 'pageLoaded',
         'url': location.href
      });
   }

   function notifyBackgroundOfScrollPosition(evtObj)
   {
      port.postMessage({
         'message': 'scrollFromClosingPage',
         'url': location.href,
         'pageYOffset': pageYOffset,
         'percent': percent
      });
   }

   function reloadOptions(options)
   {
      if (debug) { console.log("reloadOptions(" + options + ")"); }

      if (options)
      {
         if (debug) { console.log("reloadOptions: options set"); }

         var scrollSavingSettings = JSON.parse(options);
         debug = scrollSavingSettings['debug'];
      }
      else
      {
         if (debug) { console.log("reloadOptions: options unset"); }

         debug = false;
      }
   }

   function init()
   {
      /* Connect to the background page so that we get updated if the user
       * changes his settings.
       * The mere act of connecting also triggers the background page to
       * send us the current options. */

      port = chrome.extension.connect({"name": "content-script"});
      port.onMessage.addListener(function(data)
      {
         if (data.message && data.message == 'reloadoptions')
         {
            if (debug)
            {
               console.log("got message 'reloadoptions': " +
                     JSON.stringify(data.options));
            }

            reloadOptions(data.options);
         }
         else if (data.message && data.message == 'scrollTo')
         {
            window.scrollTo(window.pageXOffset, data.pageYOffset);
         }
      });


      // Listen to scroll-events, to save the scroll position
      $(window).scroll(saveScrollPosition);
      // Listen to unload-events to save the scroll position
      $(window).unload(notifyBackgroundOfScrollPosition);
      // Listen to load-events to scroll to the last scroll position
      $(window).load(notifyBackgroundPageThatPageHasLoaded);
   }

   /* return a function so that "new" has a function to instantiate.
    * Since the function was part of this closure, the closure will
    * remain alive. */
   return function ()
   {
      init();

      return {
         ReloadOptions: reloadOptions
      };
   };

})();

/* ------------------------------------------------------------------------ */

var ContextMenuHelperContentScript = (function()
{
   var debug = false;
   var a = null, jqDiv = null, cachedTags = null;

   var lastRightClickedLink = null;

   var contextClickedItems = {};
   function contextMenuEventHandler(evt)
   {
      var srcElement = evt.srcElement;
      if (srcElement.tagName.toLowerCase() != 'a')
      {
         var parentA = $(srcElement).parent('a');
         if (parentA && parentA.length > 0)
         {
            srcElement = parentA[0];
         }
         else
         {
            if (debug)
            {
               console.log("Orbvious Interest: Could not resolve " +
                     "A-element that was right-clicked on.");
            }
            return;
         }
      }

      /* Note: Issue #211 showed that we must use ".href" and not
       * .getAttribute('href'), since the latter returns the actual text of the
       * href, and not he absolute URL to the link. */
      var url = srcElement.href;
      contextClickedItems[url] = {
         'url': url,
         'text': $(evt.srcElement).text()
      };
   }

   function getAdditionalUrlInfo(request, callback)
   {
      /* Since the background script is trying to resolve a context-menu
       * click on a link, it needs the text of the link. Sadly, Chrome does
       * not provide that information, only the URL of the link.
       * So we'll search the page for the first link with the
       * same href. */

      if (contextClickedItems[request.url])
      {
         callback(contextClickedItems[request.url]);
      }
      else if (contextClickedItems[request.alternateUrl])
      {
         callback(contextClickedItems[request.alternateUrl]);
      }
      else
      {
         callback(null);
      }
   }

   function clearAndInitEditTags(edittags)
   {
      if (edittags.hasClass('empty'))
      {
         edittags.removeClass('empty');
         edittags.val('');
      }      
   }

   function onCloseDOMWindow()
   {
      $(document).unbind('keydown', 'esc', closeDOMWindow); 
      $(document).unbind('keydown', 'return', submitDOMWindow);       
   }

   function closeDOMWindow()
   {
      $('#OrbviousInterest_DOMWindow').closeDOMWindow();
   }

   function submitDOMWindow()
   {
      var domWin = $('#OrbviousInterest_DOMWindow');
      var urlElem = domWin.find('.url');
      var titleElem = domWin.find('.title');
      var tagsElem = domWin.find('.tags');

      chrome.extension.sendRequest(
         {
            'command': 'markUnread',
            'url': urlElem.val(),
            'title': titleElem.val()
         },
         function (success) {
            if (success)
            {
               var tags = tagsElem.hasClass('empty') ? 
                  null : tagsElem.val();
               if (tags)
               {

                  chrome.extension.sendRequest(
                     {
                        'command': 'updateItem',
                        'url': urlElem.val(),
                        'title': titleElem.val(),
                        'tags': tagsElem.val()
                     },
                     function (successOfTags)
                     {
                        if (!successOfTags)
                        {
                           alert('Error saving tags! However, the item ' + 
                                 'was successfully marked as unread.');
                        }
                        closeDOMWindow();
                     });
               }
               else {
                  closeDOMWindow();
               }
            }
            else
            {
               // TODO: display error message in div instead of alert()
               alert('Error marking as unread!');
               closeDOMWindow();
            }               
         });      
   }

   function isPageAnException()
   {
      var url = location.href;
      // Special exceptions: Mint.com
      if (url.match(/\.mint\.com/))
      {
         return true;
      }

      return false;
   }

   function init()
   {
      if (isPageAnException())
      {
         return false;
      }

      document.addEventListener(
            'contextmenu', 
            function(e) { return contextMenuEventHandler(e); },
            true);

      var div = document.createElement('div');
      div.innerHTML =
"<div class='container'>" +
"  <div class='header'>Mark as unread</div>" +
"  URL <input type='text' value='' class='url' readonly='readonly'/><br/>" +
   "  Title <input type='text' value='' class='title' /><br/>" +
"  Tags <input type='text' value='tags, seperated by commas' class='tags empty' />" +
"  <div class='buttons'>" +
"     <input type='button' value='Cancel' class='cancel' />" +
"     <input type='button' value='Save' class='save' />" +
"  </div>" +
"</div>"
      ;
      div.style.display = 'none';
      div.id = 'orbiousinterest_dialog';
      jqDiv = $(document.body.appendChild(div));

      jqDiv.find('.cancel').click(function ()
      {
         closeDOMWindow();
      });
      jqDiv.find('.save').click(submitDOMWindow);
      
      a = document.createElement('a');
      document.body.appendChild(a);
      a.id = 'ORBVIOUS_DOMWindowHost';
      a.setAttribute('href', '#orbiousinterest_dialog');
      a = $(a);
      a.openDOMWindow({ 
         eventType:'click', 
         loader:1, 
         loaderImagePath: chrome.extension.getURL('ajax-loader.gif'), 
         loaderHeight:25, 
         loaderWidth:25,
         height: 150,
         width: 500,
         functionCallOnOpen: function()
         {
            $(document).bind('keydown', 'esc', closeDOMWindow); 
            $(document).bind('keydown', 'return', submitDOMWindow); 
            $('#OrbviousInterest_DOMWindow .title').focus();
         },
         functionCallOnClose: onCloseDOMWindow
      });

      chrome.extension.sendRequest(
         {
            'command': 'getAllTags'
         },
         function(tagsList) {
            var normalizedTags = {};
            for (var i in tagsList)
            {
               normalizedTags[tagsList[i].toLowerCase()] = tagsList[i];
            }
            cachedTags = normalizedTags;
         });

      chrome.extension.onRequest.addListener(
            function (request, sender, callback)
      {
         if (!request)
            return;

         if (request.url && 
               (request.command == 'ORBVIOUS_GetAdditionalUrlInfo') &&
               callback)
         {
            getAdditionalUrlInfo(request, callback);
         }
         else if (request.command == 'ORBVIOUS_ShowAddDialog')
         {
            a.click();

            // Need to use chrome.extension.getURL, since the shadow.png
            // file is being injected as part of the content script
            $('.ORBVIOUS_autocomplete-w1').css(
               'background',
               'url(' + chrome.extension.getURL('shadow.png') + ')');

            var p = $('#OrbviousInterest_DOMWindow');
            p.css('border-radius', '8px');
            p.find('.url').val(request.url);
            p.find('.title').val(request.title);
            var edittags = p.find('.tags');
            edittags.val('tags, separated by commas');
            if (!edittags.hasClass('empty'))
               edittags.addClass('empty');
            edittags.autocomplete({
               minChars: 1,
               delimiter: /,\s*/,
               maxHeight: 200,
               width: 300,
               noSuggestExisting: true,
               zIndex: 10002, /*because OrbviousInterest_DOMWindow is 10001*/
               lookup: function ()
               {
                  var l=[];
                  for(var k in cachedTags)
                     // only show tags not selected
                     l.push(k);
                  return l;
               }
            });
            edittags.click(function () { clearAndInitEditTags(edittags); });
            edittags.focus(function () { clearAndInitEditTags(edittags); });
         }
      });
   }

   /* return a function so that "new" has a function to instantiate.
    * Since the function was part of this closure, the closure will
    * remain alive. */
   return function ()
   {
      init();

      return { 
         'dummy': 'dummy-value'
      };
   };

})();


/* ------------------------------------------------------------------------ */

function contentStartup()
{
   var keyCS = new ShortcutKeyContentScript();
   window.ORBVIOUS_scrollSaver = new ScrollSavingContentScript();
   jQuery(function()
         { 
         window.googleReaderCS = new GoogleReaderContentScript();
         window.ORBVIOUS_contextMenuHelper =
            new ContextMenuHelperContentScript();
         });
}

// As per issue #238, delay loading of the content-script on NetVibes.com,
// to avoid conflicting with their website.
if ((window.location.href.indexOf('http://www.netvibes.com') == 0))
{
   jQuery.load(function() { contentStartup(); });
}
// As per issue #224, disable loading delay loading of the content-script on
// redditplayer.phoenixforgotten.com to avoid conflicting with their website.
else if (window.location.href.indexOf('http://redditplayer.phoenixforgotten.com') == 0)
{
   // Do nothing
}
else
{
   jQuery(function() { contentStartup(); });
}


