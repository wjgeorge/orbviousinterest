function htmlEntities(str)
{
   return String(str).
      replace(/&/g, '&amp;').
      replace(/</g, '&lt;').
      replace(/>/g, '&gt;').
      replace(/"/g, '&quot;');
}

var RILURLBuilderSingleton = (function()
{
   var singleInstance = null;

   function UrlBuilderImplementation()
   {
      var username = null
      var password = null;
      var apikey = "c3cp9T5fAb3e9L5391gf4d4G5bd3t308";

      var _URLs = {
         'add' : 'https://readitlaterlist.com/v2/add',
         'send' : 'https://readitlaterlist.com/v2/send',
         'get' : 'https://readitlaterlist.com/v2/get',
         'auth' : 'https://readitlaterlist.com/v2/auth',
         'text' : 'https://text.readitlaterlist.com/v2/text'
      };

      this.Init = function ()
      {
         // Put init code here.
      }

      this.SetUsernameAndPassword = function (user, pass)
      {
         username = user;
         password = pass;
      }

      this.IsReady = function ()
      { 
         return (username != null) && (password != null);
      }

      this.MakeURL = function (method, params)
      {
         if (!this.IsReady())
         {
            throw "RILURLBuilderSingleton not ready. " + 
               "Username and password must be set!";
         }

         params = params || {};
         params['username'] = username;
         params['password'] = password;
         params['apikey'] = apikey;
         return _URLs[method] + "?" + jQuery.param(params);
      }

      this.GetTextViewUrl = function (id)
      {
         return 'http://getpocket.com/a/read/' + id;
      }

      this.GetArticleIdFromTextViewUrl = function (url)
      {
         var prefix = 'http://getpocket.com/a/read/';
         if (url.substr(0, prefix.length) == prefix)
         {
            var id = parseInt(url.substr(prefix.length));
            return id;
         }
         else
         {
            return null;
         }
      }
   }

   return function() {
      if (singleInstance == null)
      {
         singleInstance = new UrlBuilderImplementation();
         singleInstance.Init();
      }
      return singleInstance;
   };
})();


var ListSingleton = (function()
{
   var singleInstance = null;

   function ListImplementation()
   {
      /* private variables */
      var dateOfLastGet;
      var list;
      var cachedByUrl, cachedListOrderedByDate, cachedUnreadCount,
          cachedTagsList;
      var readItLater = new ReadItLaterSingleton();

      this.Init = function ()
      {
         // initialization code
         dateOfLastGet = null;
         listFromServer = {};
         list = {};

         clearCache();
      }

      this.GetDateOfLastGet = function ()
      {
         return dateOfLastGet;
      }

      function clearCache()
      {
         cachedByUrl = null;
         cachedListOrderedByDate = null;
         cachedUnreadCount = null;
         cachedTagsList = null;
      }

      function rebuildCacheOfTags()
      {
         var tags = {};

         for (var id in list)
         {
            if ((typeof(list[id].tags) != 'undefined') &&
                (list[id].tags != null))
            {
               var tagsForItem = list[id].tags.split(",");
               
               for (var i in tagsForItem)
               {
                  var tag = tagsForItem[i];
                  if (typeof(tags[tag]) == 'undefined')
                  {
                     tags[tag] = 1;
                  }
               }
            }
         }

         var tagsAsArray = [];
         for (var tag in tags)
         {
            tagsAsArray.push(tag);
         }

         cachedTagsList = tagsAsArray;
      }

      function rebuildCacheOfByUrl() 
      {
         var unreadCount = 0;
         var byUrl = {};
         for (var id in list)
         {
            var url = normalizeUrlToKey(list[id].url);
            byUrl[url] = list[id];
            
            if (list[id].state == 0) // state == 0 means unread
            {
               ++unreadCount;
            }
         }
         cachedByUrl = byUrl;
         cachedUnreadCount = unreadCount;
      }

      function rebuildCacheOfByDate() 
      {
         var byDate = {};
         var listOfDates = [];
         var unreadCount = 0;

         for (var id in list)
         {
            var itemDate = list[id]['time_updated'];
            // we prepend 'date' so that the index used will not be numeric,
            // thus making the collection act like an object instead of an array
            var dateKey = 'date' + itemDate;
            // Just make sure we don't add a date that's already in the list
            // (we check this by making sure we don't have items from that date)
            if (typeof(byDate[dateKey]) == 'undefined')
            {
               listOfDates.push(itemDate);
            }

            /* Add the item to the collection of items added on the same date
             * (assuming the items would have different dates led to reopening
             * issue #12)
             */
            if (typeof(byDate[dateKey]) == 'undefined')
            {
               byDate[dateKey] = [];
            }
            byDate[dateKey].push(list[id]);

            if (list[id].state == 0) // state == 0 means unread
            {
               ++unreadCount;
            }
         }
         
         // Sort in descending order
         listOfDates.sort(function(a,b) { return b - a; });

         var orderedByDate = [];
         for (var i=0; i<listOfDates.length; ++i)
         {
            var dateKey = 'date' + listOfDates[i];
            for (var j=0; j<byDate[dateKey].length; ++j)
            {
               orderedByDate.push(byDate[dateKey][j]);
            }
         }

         cachedListOrderedByDate = orderedByDate;
         cachedUnreadCount = unreadCount;
      }

      this.UpdateFromServer = function (responseText, clearAll)
      {
         var l = JSON.parse(responseText);
         dateOfLastGet = l['since'];
         var hasThereBeenChange = (l['status'] == 1);
         if (hasThereBeenChange)
         {
            clearCache();
            if (list == null || clearAll)
            {
               list = {};
            }

            var rawList = l['list'];
            for (var id in rawList)
            {
               list[id] = rawList[id];
            }
         }
      }

      /* Normalize the URL to be lookup key in the URL-collection */
      function normalizeUrlToKey(url)
      {
         /* remove empty anchor tag */
         var anchorIndex = url.indexOf('#');
         if ((anchorIndex != -1) && (anchorIndex == url.length - 1))
         {
            return url.substr(0, anchorIndex);
         }
         else
         {
            return url;
         }
      }

      /* Returns 0 if unread, 1 if read. Returns null if neither. */
      this.GetUrlState = function (url)
      {
         url = normalizeUrlToKey(url);

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         if (cachedByUrl[url] != null)
         {
            return cachedByUrl[url].state; // state == 0 for "unread" and 1 for "read"
         }
         else
         {
            return null; // Neither read nor unread
         }
      }

      this.SetUrlState = function (url, state)
      {
         url = normalizeUrlToKey(url);

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         if (cachedByUrl[url] != null)
         {
            // state == 0 for "unread" and 1 for "read"
            if (state == 1 || state == 0)
            {
               // only update if changed
               if (cachedByUrl[url].state != state)
               {
                  cachedByUrl[url].state = state;
                  cachedByUrl[url].time_updated = readItLater.GetNowAsRILTime();
                  cachedByUrl[url].dirty = true; // might differ on server

                  // invalidate and update relevant caches
                  cachedListOrderedByDate = null;
                  cachedUnreadCount += (state==0) ? 1 : -1;
               }
            }
            else
            {
               throw ("Attempted to set url='" + url +
                     "' to invalid state of '" + state + "'");
            }
         }
      }

      this.GetAllItemsByDate = function ()
      {
         if (cachedListOrderedByDate == null) { rebuildCacheOfByDate(); }

         var allByDate = [];
         for (var i in cachedListOrderedByDate)
         {
            allByDate.push({
               'url': cachedListOrderedByDate[i].url,
               'title': cachedListOrderedByDate[i].title,
               'time_added': cachedListOrderedByDate[i].time_added,
               'time_updated': cachedListOrderedByDate[i].time_updated,
               'tags': cachedListOrderedByDate[i].tags,
               'state': cachedListOrderedByDate[i].state
            });
         }

         return allByDate;
      }

      this.GetUnreadCount = function ()
      {
         if (cachedUnreadCount == null) { rebuildCacheOfByUrl(); }

         return cachedUnreadCount;
      }

      this.RemoveUrl = function (url)
      {
         url = normalizeUrlToKey(url);         

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         if (cachedByUrl[url] != null)
         {
            delete list[cachedByUrl[url].item_id];
            clearCache();
         }
      }

      this.AddNewUnreadUrl = function (url, title)
      {
         var id = Math.round((new Date()).getTime() / 1000);
         url = normalizeUrlToKey(url);
         list[id] = {
            'url': url,
            'title': title,
            'state': 0, // 0 means unread
            'time_updated': id,
            'time_added': id,
            'generated_id': true, // this ID cannot be used in requests
            'dirty': true // this might not agree with what's on the server
         };

         clearCache();
      }

      this.SetTitle = function (url, title)
      {
         url = normalizeUrlToKey(url);         

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         if (cachedByUrl[url])
         {
            cachedByUrl[url].title = title;
            cachedByUrl[url].dirty = true; // data from server might disagree
            return true;
         }

         return false;
      }

      this.SetTags = function (url, tags)
      {
         url = normalizeUrlToKey(url);         

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         if (cachedByUrl[url])
         {
            cachedByUrl[url].tags = tags;
            cachedByUrl[url].dirty = true; // data from server might disagree
            return true;
         }

         return false;
      }

      this.GetUrlItemId = function (url)
      {
         url = normalizeUrlToKey(url);         

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         // If the item was generated then the ID is not valid
         // enough for most actions
         if (cachedByUrl[url] != null && cachedByUrl[url].generated_id)
         {
            console.log("WARNING: item with url '" + url +
                  "' has a generated ID. Querying it is silly.");
         }

         return (cachedByUrl[url] != null && !cachedByUrl[url].generated_id) ?
            cachedByUrl[url].item_id : null;
      }

      this.GetItemUrlById = function (id)
      {
         return (list[id]) ? list[id].url : null;
      }

      this.GetAllTags = function ()
      {
         if (cachedTagsList == null)
         {
            rebuildCacheOfTags();
         }

         return cachedTagsList;
      }

      this.SetScrollPosition = function (url, position)
      {
         url = normalizeUrlToKey(url);         

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         if (cachedByUrl[url] != null)
         {
            cachedByUrl[url].position = position;
         }
      }

      this.GetScrollPosition = function (url)
      {
         url = normalizeUrlToKey(url);         

         if (cachedByUrl == null) { rebuildCacheOfByUrl(); }

         return (cachedByUrl[url] != null) ? cachedByUrl[url].position : null;
      }
   }

   return function ()
   {
      if (singleInstance == null)
      {
         singleInstance = new ListImplementation();
         singleInstance.Init();
      }
      return singleInstance;
   }
})();

var ReadItLaterSingleton = (function() 
{
   var singleInstance = null;

   function ReadItLaterImplementation()
   {
      var rilURLBuilder = null;
      var dateOfLastGet = null;
      var rilList = null;

      var listGetRetry = {
         delay: null,
         delayTimerId: null,
         minDelayMSec: 10000,
         maxDelayMSec: 3600000
      };
      var events = { 'onUrlStateChanged': [] };
      var queue = {
         'timeout': null,
         //'waitTime': 1000 * 60 * 5, // 5 minutes
         //'waitTime': 1000 * 30, // 30 seconds
         'waitTime': 1000 * 10, // 10 seconds
         'items': [],
         'lockedForFlush': false,
         'callbacksAfterFlush': []
      };

      this.Init = function ()
      {
         rilList = new ListSingleton();
         rilURLBuilder = new RILURLBuilderSingleton();

         this.reloadOptions();

         if (!rilURLBuilder.IsReady()) {
            chrome.tabs.create({url: "options.html"});
         }
      }

      this.reloadOptions = function ()
      {
         if (localStorage['username'] && localStorage['password'])
         {
            rilURLBuilder.SetUsernameAndPassword(
                  localStorage['username'], localStorage['password']);
         }
      }

      function addEventListener(eventName, callback)
      {
         if (!events[eventName])
         {
            events[eventName] = [];
         }

         events[eventName].push(callback);
      }

      this.AddEventListener = function (eventName, callback)
      {
         addEventListener(eventName, callback);
      }

      this.CopyAllItemsBetweenAccounts = function (options)
      {
         // Get the items by emptying the list, changing the username/password
         // and re-fetching
         rilList.Init();
         rilURLBuilder.SetUsernameAndPassword(
               options.sourceUsername, options.sourcePassword);
         requestList(null, function ()
         {
            // Now that rilList has the list, we can copy it
            var allItems = rilList.GetAllItemsByDate();
            var newItems = [], readItems = [], updateTagsItems = [];
            for (var k in allItems)
            {
               var item = allItems[k];
               if (item.state == 0) // unread
               {
                  newItems.push({'url': item.url, 'title': item.title});
               }
               else if (item.state == 1) // read
               {
                  readItems.push({'url': item.url, 'title': item.title});
               }
            
               // Regardless of read/unread, an item may have tags. Update them!
               if (item.tags && item.tags.length > 0)
               {
                  updateTagsItems.push({'url': item.url, 'tags': item.tags});
               }
            }
         
            // "switch" to the destination user, and write the list
            rilList.Init();
            rilURLBuilder.SetUsernameAndPassword(
               options.destinationUsername, options.destinationPassword);
            // Note: There's a limit to how much you can send in a single
            // "send" request. Let's artificially limit the number of items,
            // and send them in batches.
            var maxInBatch = 10;
            var batches = [];
            var currentBatch = 0, numInBatch = 0;
            for (var k in newItems)
            {
               if (!batches[currentBatch])
               {
                  batches[currentBatch] = {'newItems': []};
               }

               batches[currentBatch].newItems.push(newItems[k]);
               ++numInBatch;

               if (numInBatch >= maxInBatch)
               {
                  ++currentBatch;
                  numInBatch = 0;
               }
            }
            for (var k in readItems)
            {
               if (!batches[currentBatch])
               {
                  batches[currentBatch] = {'readItems': []};
               }
               // (this is in case we're adding to a batch with unread items)
               if (!batches[currentBatch].readItems)
               {
                  batches[currentBatch].readItems = [];
               }

               batches[currentBatch].readItems.push(readItems[k]);
               ++numInBatch;

               if (numInBatch >= maxInBatch)
               {
                  ++currentBatch;
                  numInBatch = 0;
               }
            }
            for (var k in updateTagsItems)
            {
               if (!batches[currentBatch])
               {
                  batches[currentBatch] = {'updateTagsItems': []};
               }
               // (this is in case we're adding to a batch with un/read items)
               if (!batches[currentBatch].updateTagsItems)
               {
                  batches[currentBatch].updateTagsItems = [];
               }

               batches[currentBatch].updateTagsItems.push(updateTagsItems[k]);
               ++numInBatch;

               if (numInBatch >= maxInBatch)
               {
                  ++currentBatch;
                  numInBatch = 0;
               }
            }

            // Send each of the batches
            for (var k in batches)
            {
               var b = batches[k];
               var callback = function(success)
                  {
                     console.log("result of copy all: " + success);
                  };
               queueSend({
                  'callback': callback,
                  'new': b.newItems,
                  'read': b.readItems,
                  'updateTags': b.updateTagsItems,
                  'flush': true
               });
            }
         });
      }

      this.GetNowAsRILTime = function ()
      {
         var now = new Date();
         return Math.floor(now.getTime() / 1000);
      }

      function startAsyncCommand(
            command, params, successCallback, errorCallback)
      {
         var xhr = new XMLHttpRequest();
         showActionInProgressOnGUI(true);

         try
         {
            console.log("Sending request...");
            //console.log("params=" + JSON.stringify(params));

            // Set a timer to give up after 10 seconds
            var timerId = window.setTimeout(function()
            {
               console.log("aborted after 10 seconds");
               showActionInProgressOnGUI(false);
               xhr.abort();
               errorCallback('timeout');
            }, 10000);

            xhr.onreadystatechange = function()
            {
               if ((xhr.readyState == 4) )
               {
                  // Check the HTTP response status:
                  //  200 OK
                  //  400 - invalid request
                  //  401 - username/password incorrect
                  //  403 - rate limit exceeded
                  //  503 - server undergoing maintanence

                  //console.log("Got response: " + xhr.responseText);

                  window.clearTimeout(timerId);
                  showActionInProgressOnGUI(false);

                  if (xhr.status == 200)
                  {
                     if (xhr.responseText)
                     {
                        var responseText = xhr.responseText;
                        if (successCallback)
                        {
                           window.setTimeout(
                                 function()
                                 {
                                    successCallback(responseText)
                                 },
                                 100);
                        }
                     }
                  }
                  else 
                  {
                     if (xhr.status == 401)
                     {
                        // TODO: handle 401 - username/password incorrect

                        delete localStorage['authchecked'];
                        updatePageActionForAllTabs();
                     }

                     /* Handle as errors */
                     if (errorCallback)
                     {
                        window.setTimeout(
                              function() { errorCallback(xhr.status); }, 100);
                     }
                  }
               }
            }

            xhr.onerror = function(error)
            {
               console.log("XHR ERROR: " + JSON.stringify(error));
               if (errorCallback)
               {
                  window.setTimeout(
                        function () { errorCallback('error'); }, 100);
               }               
            }

            xhr.open("GET", rilURLBuilder.MakeURL(command, params), true);
            xhr.send(null);
         }
         catch (e)
         {
            console.log("ex: " + e);
            console.error("exception: " + e);
            showActionInProgressOnGUI(false);
         }
      }

      function requestList(dateToGetFrom, callback)
      {
         console.log('requestList(' + dateToGetFrom + ')');

         var params = {
            format: 'json',
            tags: 1,     // this is in order to get the tags
            positions: 1 // this is in order to get the last-read position
         };
         if (dateToGetFrom)
         {
            params['since'] = dateToGetFrom;
         }

         startAsyncCommand('get', params,
            function (responseText)
            {
               console.log("got list: " + responseText);

               if (listGetRetry.delayTimerId != null)
               {
                  window.clearTimeout(listGetRetry.delayTimerId);
                  listGetRetry.delayTimerId = null;
                  listGetRetry.delay = null;
               }

               var clearAll = (dateToGetFrom == null);
               rilList.UpdateFromServer(responseText, clearAll);
               
               setTimeout(
                  function ()
                  {
                     updatePageActionForAllTabs();

                     if (callback) { callback(); }
                  },
                  100);
            },
            function (error)
            {
               if ((listGetRetry.delayTimerId == null) && 
                  (error == 'timeout' || error == 403 || error == 503))
               {
                  listGetRetry.delay = (listGetRetry.delay == null) ? 
                     listGetRetry.minDelayMSec : (listGetRetry.delay * 2);
                  listGetRetry.delay = 
                     (listGetRetry.delay > listGetRetry.maxDelayMSec) ?
                     listGetRetry.maxDelayMSec : listGetRetry.delay;

                  listGetRetry.delayTimerId = window.setTimeout(
                     function ()
                     {
                        listGetRetry.delayTimerId = null;
                        requestList(dateToGetFrom, callback);
                     },
                     listGetRetry.delay);
               }
            });
      }

      function refreshListChangesFromServer(callback)
      {
         requestList(rilList.GetDateOfLastGet(), callback);
      }      

      this.RefreshListFromServer = function (callback)
      {
         requestList(null, callback);
      }

      this.GetUnreadCount = function ()
      {
         return rilList.GetUnreadCount();
      }

      this.GetUrlState = function (url)
      {
         /* It's possible that the URL we're being asked about
          * is the url of the Text-View or Article View from readitlaterlist,
          * and we want to be able to mark it as read. */
         var id = rilURLBuilder.GetArticleIdFromTextViewUrl(url);
         if (id != null)
         {
            var urlOfTextView = rilList.GetItemUrlById(id);
            if (urlOfTextView != null)
            {
               url = urlOfTextView;
            }
         }
         
         return rilList.GetUrlState(url);
      }

      this.GetAllItemsByDate = function ()
      {
         return rilList.GetAllItemsByDate();
      }

      this.IsAuthenticated = function ()
      {
         // Note: for now, I'm assuming that if the user set the
         // username/password, then he's authenticated.
         
         // TODO: if there's an auth-error, need to flag that.
         //       rilURLBuilder doesn't know about auth,
         //       only about neededing a username/password.

         // TODO: also update the stored flag, localStorage['authchecked']
         //       which rememebers if the username/password have been checked.
         //       on auth failure, clear that flag. 

         return (localStorage['authchecked']==1) && rilURLBuilder.IsReady();
      }

      function areAllItemsAlreadyMarked(newItems, readItems)
      {
         var allNewItemsMarkedUnread = true;
         if (newItems)
         {
            for (var k in newItems)
            {
               /* state == 0 means "unread", and thus we don't need to
                * mark it again as unread */
               if (rilList.GetUrlState(newItems[k].url) != 0)
               {
                  allNewItemsMarkedUnread = false;
               }
            }
         }

         var allReadItemsMarkedRead = true;
         if (readItems)
         {
            for (var k in readItems)
            {
               /* state == 1 means "read", and thus we don't need to
                * mark it again as read */
               if (rilList.GetUrlState(readItems[k].url) != 1)
               {
                  allReadItemsMarkedRead = false;
               }
            }
         }

         return allNewItemsMarkedUnread && allReadItemsMarkedRead;
      }

      function getLength(collection)
      {
         var count = 0;

         if (!collection)
         {
            return 0;
         }

         for (var k in collection)
         {
            ++count;
         }
         return count;
      }

      function queueFlush(args)
      {
         if (queue.lockedForFlush)
         {
            console.log(
                  "queueFlush() called while flush in progress. Ignored.");
            if (typeof(args.callback) == "function")
            {
               queue.callbacksAfterFlush.push(args.callback);
            }
            return;
         }

         // To minmize race conditions, we'll just copy the queue's
         // data into local variables, and clear it.
         //
         // Note: A race condition might still arise, but it's such a small
         //       span that I'm not going to bother fixing it.

         queue.lockedForFlush = true;
         
         if (queue.timeout != null)
         {
            clearTimeout(queue.timeout);
            queue.timeout = null;
         }

         if (typeof(args.callback) == "function")
         {
            queue.callbacksAfterFlush.push(args.callback);
         }
         
         var items = queue.items;
         queue.items = [];
         var cbs = queue.callbacksAfterFlush;
         queue.callbacksAfterFlush = [];
         queue.lockedForFlush = false;

         // Go over all the queued items, in order, and determine what actually
         // need to get done. (Since it's possible the user deleted an item
         // after renaming it; or renamed it twice, or changed tags twice, or
         // whatever.)

         var urls = {};
         for (var i in items)
         {
            var queueItem = items[i];

            var newItems = queueItem['new'];
            if (newItems)
            {
               for (var j in newItems)
               {
                  var n = newItems[j];
                  if (!urls[n.url])
                  {
                     // Note: this can happen if an item is marked as unread
                     // or if a deleted item is re-added quickly
                     urls[n.url] = {};
                  }
                  urls[n.url]['title'] = n.title;
                  urls[n.url]['unread'] = true;
                  urls[n.url]['delete'] = false;
               }
            }

            var readItems = queueItem['read'];
            if (readItems)
            {
               for (var j in readItems)
               {
                  var r = readItems[j];
                  if (!urls[r.url])
                  {
                     urls[r.url] = {};
                  }
                  urls[r.url]['unread'] = false;
               }
            }

            var updateTitleItems = queueItem['updateTitle'];
            if (updateTitleItems)
            {
               for (var j in updateTitleItems)
               {
                  var u = updateTitleItems[j];
                  if (!urls[u.url])
                  {
                     urls[u.url] = {};
                  }
                  urls[u.url]['title'] = u.title;
               }
            }

            var updateTagsItems = queueItem['updateTags'];
            if (updateTagsItems)
            {
               for (var j in updateTagsItems)
               {
                  var t = updateTagsItems[j];
                  if (!urls[t.url])
                  {
                     urls[t.url] = {};
                  }
                  urls[t.url]['tags'] = t.tags;
               }
            }

            var deleteItems = queueItem['delete'];
            if (deleteItems)
            {
               for (var j in deleteItems)
               {
                  var d = delteItems[j];
                  if (!urls[d.url])
                  {
                     urls[d.url] = {};
                  }
                  urls[d.url]['delete'] = true;
                  urls[n.url]['unread'] = false;
               }
            }            
         }

         // Now that we have boiled down the queue into the actions that have
         // to be performed on each item, we must convert this into the params
         // that the 'send' endpoint can understand

         var deleteItemsForJSON = {};
         var deleteItemsNum = 0;
         var newItemsForJSON = {};
         var newItemsNum = 0;
         var updateTitleItemsForJSON = {};
         var updateTitleItemsNum = 0;
         var updateTagsItemsForJSON = {};
         var updateTagsItemsNum = 0;
         var readItemsForJSON = {};
         var readItemsNum = 0;
         var allUrls = [];
         
         for (var url in urls)
         {
            allUrls.push(url);

            var item = urls[url];

            if (item['delete'] === true && !item['unread'])
            {
               // The item has been deleted, and not subsequently re-added

               deleteItemsForJSON[deleteItemsNum] = { 'url': url };
               ++deleteItemsNum;
               // The item's been deleted, no further updates are required
               continue;
            }

            if (item['unread'] === true)
            {
               // The item has been either newly added or marked as unread
               newItemsForJSON[newItemsNum] = {
                  'url': url,
                  'title': htmlEntities(item.title)
               };
               ++newItemsNum;
            }
            else if (item['title'])
            {
               // The item already existed, we're just changing the title
               // Note: If the item was newly added, this step would have been
               //       taken care of by the code that adds new items, even if
               //       the item's title has been modified (as long as that
               //       modification happend before the start of the flush).
               updateTitleItemsForJSON[updateTitleItemsNum] =
                  { 'title': item.title };
               ++updateTitleItemsNum;
            }

            // As long as the item hasn't been deleted (in other words,
            // whether it's new or marked as unread or whatever) we have
            // other changes that might apply: changing tags and
            // marking as read

            if (item['tags'])
            {
               updateTagsItemsForJSON[updateTagsItemsNum] =
                  { 'url': url, 'tags': item.tags }
               ++updateTagsItemsNum;
            }

            if (item['unread'] === false)
            {
               readItemsForJSON[readItemsNum] = { 'url': url };
               ++readItemsNum;
            }
         }

         var requestParams = {};
         if (newItemsNum > 0)
         {
            requestParams['new'] = JSON.stringify(newItemsForJSON);
         }
         if (readItemsNum > 0)
         {
            requestParams['read'] = JSON.stringify(readItemsForJSON);
         }
         if (updateTitleItemsNum > 0)
         {
            requestParams['update_title'] =
               JSON.stringify(updateTitleItemsForJSON);
         }
         if (updateTagsItemsNum > 0)
         {
            requestParams['update_tags'] = 
               JSON.stringify(updateTagsItemsForJSON);
         }
         if (deleteItemsNum > 0)
         {
            requestParams['delete'] = JSON.stringify(deleteItemsForJSON);
         }
         
         var callWaitingCallbacks = function (success)
         {
            // Finally, we can call all the callbacks that have been waiting
            // for the "flush" to complete.

            for (var i in cbs)
            {
               var f = cbs[i];
               if (typeof(f) == "function")
               {
                  continue;
               }
               f(success);
            }            
         };

         var onSuccess = function ()
         {
            // Report the success
            if (args.callback) { callWaitingCallbacks(1); }
         }

         var onError = function ()
         {
            // Report the error
            if (args.callback) { callWaitingCallbacks(null); }
         }

         startAsyncCommand('send', requestParams, onSuccess, onError);         
      }

      /* This is equivalent to the "send" command in the ReadItLater API.
       * It allows you to mark items as read and unread, update titles, and
       * update tags - all in one service call.
       *
       * args = { 
       *    'new': [new_items],
       *    'read': [read_items],
       *    'updateTitle': [items_with_new_titles],
       *    'updateTags': [items_with_new_tags],
       *    'delete': [items_to_delete]
       * }
       *
       */

      function queueSend(args)
      {
         if (!args) return;

         var keys = ['new', 'read', 'updateTitle', 'updateTags', 'delete'];
         var itemToQueue = {};
         var found = false;
         for (var i in keys)
         {
            if ((typeof(args[keys[i]]) != 'undefined') &&
                  (args[keys[i]] != null))
            {
               itemToQueue[keys[i]] = args[keys[i]];
               found = true;
            }
         }

         if (found)
         {
            queue.items.push(itemToQueue);
         }

         // If the caller asked for a flush, only call the callback
         // after the flush is complete. (Note: the callback might not exist.)
         if (args.flush)
         {
            if (typeof(args.callback) == "function")
               queueFlush({callback: args.callback});
            else
               queueFlush({});
         }
         else 
         {
            if (typeof(args.callback) == "function")
            {
               args.callback();
            }

            if (queue.timeout != null)
            {
               clearTimeout(queue.timeout);
               queue.timeout = null;
            }
            queue.timeout = setTimeout(
                  function() { queueFlush({}); },
                  queue.waitTime);
         }

         // There's no reason to delay updating the list and the UI,
         // so update them right away!
         var allUrls = [];
         var item;
         for (var i in args['new'])
         {
            item = args['new'][i];
            rilList.AddNewUnreadUrl(item.url, item.title);
            allUrls.push(item.url);
         }
         for (var i in args['read'])
         {
            item = args['read'][i];
            rilList.SetUrlState(item.url, 1);
            allUrls.push(item.url);
         }
         for (var i in args['updateTitle'])
         {
            item = args['updateTitle'][i];
            rilList.SetTitle(item.url, item.title);
            allUrls.push(item.url);
         }
         for (var i in args['updateTags'])
         {
            var item = args['updateTags'][i];
            rilList.SetTags(item.url, item.tags);
            allUrls.push(item.url);
         }
         for (var i in args['delete'])
         {
            item = args['delete'][i];
            rilList.RemoveUrl(item.url);
            allUrls.push(item.url);
         }

         updatePageActionForAllTabs();
         updateContextMenuForSelectedTab();

         for (var i in allUrls)
         {
            if (events['onUrlStateChanged'])
            {
               for (var j in events['onUrlStateChanged'])
               {
                  var cb = events['onUrlStateChanged'][j];
                  cb(allUrls[i]);
               }
            }
         }         
      }

      function deleteItem(url, callback)
      {
         var itemsToDelete = [{ 'url': url }];

         queueSend({
            'callback': callback,
            'delete': itemsToDelete
         });
      }

      this.DeleteItem = function (url, callback)
      {
         deleteItem(url, callback);
      }

      this.SetAsUnread = function (url, title, callback, tags)
      {
         var unreadItems = [{ 'url': url, 'title': title }];

         var updateTagsItems = [];

         /* Add the tags, if they've been specified. */
         if ((typeof(tags) != 'undefined') && (tags != null))
         {
            updateTagsItems = [{ 'url': url, 'tags': tags }];
         }

         queueSend({
            'callback': callback,
            'new': unreadItems,
            'updateTags': updateTagsItems
         });
      }

      this.SetAsRead = function (url, callback)
      {
         /* It's possible that the URL we're being told to mark as read
          * is the url of the Text-View or Article View from readitlaterlist,
          * and we want to be able to mark it as read. */
         var id = rilURLBuilder.GetArticleIdFromTextViewUrl(url);
         if (id != null)
         {
            var urlOfTextView = rilList.GetItemUrlById(id);
            if (urlOfTextView != null)
            {
               url = urlOfTextView;
            }
         }

        var readItems = [{ 'url': url}];

        queueSend({
           'callback': callback,
           'read': readItems
        });
      }

      function updateItemTitle(url, title, callback)
      {
         var updateTitleItems = [{ 'url': url, 'title': title }];
         queueSend({
            'callback': callback,
            'updateTitle': updateTitleItems
         });
      }

      this.UpdateItemTitle = function (url, title, callback)
      {
         return updateItemTitle(url, title, callback);
      }

      this.UpdateItemTags = function (url, tags, callback)
      {
         var updateTagsItems = [{ 'url': url, 'tags': tags }];
         queueSend({
            'callback': callback,
            'updateTags': updateTagsItems
         });
      }

      function getLinkToReadItLaterUrlTextView(url, callback)
      {
         if (rilList.GetUrlState(url) == null)
         {
            if (callback) { callback(null); }
            return;
         }

         var id = rilList.GetUrlItemId(url);
         var textUrl = (id != null) ? rilURLBuilder.GetTextViewUrl(id) : null;
         if (callback)
         {
            callback(textUrl);
         }         
      }

      this.GetLinkToReadItLaterUrlTextView = function (url, callback)
      {
         getLinkToReadItLaterUrlTextView(url, callback);
      }

      this.GetTextOfUrl = function (url, callback, options)
      {
         if (rilList.GetUrlState(url) == null)
         {
            return;
         }

         var reqParams = {'url': url};
         if (options)
         {
            if (options.mode)
            {
               reqParams.mode = options.mode;
            }
            if (options.images)
            {
               reqParams.images = options.images;
            }
         }

         var onSuccess = function (responseText)
         {
            if (callback) { callback(responseText); }
         }

         var onError = function ()
         {
            // Report the error
            if (callback) { callback(null); }
         }
         
         startAsyncCommand('text', reqParams, onSuccess, onError);
      }      

      this.GetAllTags = function ()
      {
         return rilList.GetAllTags();
      }

      this.SavePageScrollPosition = 
         function (url, pageYOffset, percent, callback)
      {
         var itemId = rilList.GetUrlItemId(url);
         if (itemId == null)
         {
            // There's no point in updating the scroll of an item we don't
            // know about

            // Report the error
            if (callback) { callback(null); }

            return;
         }

         var views = {
            '2': // We only know how to do '2' view, which is for webpages,
                 // and uses the y-offset and scroll percentage only
               {
                  'view': '2',
                  'item_id': itemId,
                  'section': 0,
                  'page': 1,
                  'nodeIndex': pageYOffset,
                  'percent': percent,
                  'time_updated': singleInstance.GetNowAsRILTime()
               }
         };
         var scrollItems = { 
            '0': { 'url': url, 'views': views } 
         };
         var reqParams = {'position': JSON.stringify(scrollItems)};

         var onSuccess = function ()
         {
            // Update the local list
            rilList.SetScrollPosition(url, views);

            // Report the success
            if (callback) { callback(1); }
         }

         var onError = function ()
         {
            // Report the error
            if (callback) { callback(null); }
         }

         startAsyncCommand('send', reqParams, onSuccess, onError);
      }

      this.GetPageScrollPosition = function (url)
      {
         if (rilList.GetUrlState(url) != null)
         {
            var scrollViews = rilList.GetScrollPosition(url);
            if (scrollViews && scrollViews['2'])
            {
               return { 
                  'pageYOffset': scrollViews['2'].nodeIndex,
                  'percent': scrollViews['2'].percent
               };
            }
         }
         
         return null;
      }

      var missingTitleQueue = {};
      var missingTitleServiceInterval = null;

      function missingTitleQueueService()
      {
         var now = (new Date()).getTime();
         for (var url in missingTitleQueue)
         {
            // Don't check a URL if it already has a resolved title
            if (missingTitleQueue[url].title) continue;
            // Don't check the same URL more than once a day
            if (now - missingTitleQueue[url].lastChecked < 24*60*60) continue;

            jQuery.get(url, function(data, textStatus, jqXHR)
            {
               var matches = data.match(/<title>(.*)<\/title>/i);
               var title = null;
               if (matches && matches[1])
               {
                  title = matches[1];
                  missingTitleQueue[url].title = title;

                  console.log('title="' + title + '"');
               }
               else
               {
                  // There's a page, but it has no title! Use a default.
                  title = 'index.html';
               }

               // update the item's title
               updateItemTitle(url, title, function()
               {
                  if (missingTitleQueue[url].callback)
                  {
                     missingTitleQueue[url].callback(url, title);
                  }
               });
            
            }, 'html');

            // We only want to fetch a single page every time,
            // so as to not overwhelm the network.
            break;
         }
      }

      function resolveMissingTitle(url, callback)
      {
         if (/*rilList.GetUrlState(url) == null || */ missingTitleQueue[url])
            return null;

         missingTitleQueue[url] = {'url': url, 'callback': callback};

         if (missingTitleServiceInterval == null)
         {
            missingTitleServiceInterval =
               setInterval(function() { missingTitleQueueService(); }, 5000);
            missingTitleQueueService();
         }
      }

      this.ResolveMissingTitle = function (url, callback)
      {
         return resolveMissingTitle(url, callback);
      }
   }

   return function () {
      if (singleInstance == null) {
         singleInstance = new ReadItLaterImplementation();
         singleInstance.Init();
      }
      return singleInstance;
   };

})();

