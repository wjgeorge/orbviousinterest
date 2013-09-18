/* Class for handling all the events of the Browser Action icon and
 * its animations, including updating the icon for a specific tab. */
var RILBrowserActionSingleton = (function()
{
   var singleInstance = null;

   function RILBrowserAction()
   {
      var step;
      var iconCanvas, iconContext;
      var imagesCache = {}, tabCache = {};
      var animationInterval;
      var currentIconUrl;
      
      this.Init = function()
      {
         iconCanvas = document.createElement('canvas');
         iconCanvas.id = "iconCanvas";
         iconCanvas.width = 19;
         iconCanvas.height = 19;
         iconCanvas = document.body.appendChild(iconCanvas);

         iconContext = iconCanvas.getContext('2d');   
         animationInterval = null;

         /* When the URL on a tab changes, update the icon */
         chrome.tabs.onUpdated.addListener(function(tabId)
         {
            if (animationInterval == null)
            {
               updatePageActionInTab(tabId);
            }
            else
            {
               animationStep(tabId);
            }
         });

         /* When the user switched tabs, update the icon */
         chrome.tabs.onSelectionChanged.addListener(function(tabId, selectInfo)
         {
            if (animationInterval == null)
            {
               updatePageActionInTab(tabId);
            }
            else
            {
               animationStep(tabId);
            }
         });
      }

      function getImageData(url, callback)
      {
         if (typeof(url) == 'undefined')
         {
            throw "Invalid image URL";
            return;
         }

         if ((typeof(imagesCache[url]) == 'undefined') ||
               (imagesCache[url] == null))
         {
            var img = document.createElement('img');
            img.onload = function () 
            { 
               imagesCache[url] = img;
               callback(imagesCache[url]); 
            }
            img.src = url;
            document.body.appendChild(img);
         }
         else
         {
            callback(imagesCache[url]);
         }
      }

      function getImageUrlForTab(tabId)
      {
         if ((typeof(tabCache[tabId]) != 'undefined') &&
               (tabCache[tabId] != null))
         {
            return tabCache[tabId].imgUrl;
         }

         return null;
      }

      function setImageUrlForTab(tabId, url)
      {
         if ((typeof(tabCache[tabId]) == 'undefined') ||
               (tabCache[tabId] == null))
         {
            tabCache[tabId] = {};
         }

         tabCache[tabId].imgUrl = url;
      }

      function getCurrentIconUrl() 
      {
         return currentIconUrl;
      }

      function setIconForTab(url, tabId)
      {
         if (typeof(url) == 'undefined')
         {
            console.log("Warning: Ignoring invalid URL for icon image");
         }

         getImageData(url, function(img)
         {
            chrome.browserAction.setIcon({'path': url, 'tabId': tabId});
            setImageUrlForTab(tabId, url);
            currentIconUrl = url;
         });
      }

      this.SetIcon = function (url, tabId)
      {
         setIconForTab(url, tabId);
      }      

      function drawAnimation(stepNum, destContext)
      {

         var width = 2, height = 4, spacing = 1, left = 1, top = 1;
         var fillstyle = 'rgba(255,0,0,A)'
         if (stepNum > 2 && stepNum < 8)
         {
            var alpha = ((stepNum - 2) / 6) * 0.5 + 0.5;
            destContext.fillStyle = fillstyle.replace('A', alpha);
            destContext.fillRect(left, top, width, height);
         }
         if (stepNum > 4 && stepNum < 10)
         {
            var alpha = ((stepNum - 4) / 6) * 0.5 + 0.5;
            destContext.fillStyle = fillstyle.replace('A', alpha);
            destContext.fillRect(left+width+spacing, top, width, height);
         }
         if (stepNum > 6)
         {
            var alpha = ((stepNum - 6) / 6) * 0.5 + 0.5
            destContext.fillStyle = fillstyle.replace('A', alpha);
            destContext.fillRect(left+width*2+spacing*2, top, width, height);
         }
      }

      function animationStep(tabId)
      {
         ++step;
         if (step > 10) { step = 0; }

         iconContext.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
         getImageData(getCurrentIconUrl(), function(img)
         {
            iconContext.drawImage(img, 0,0);
            drawAnimation(step, iconContext);
            chrome.browserAction.setIcon({
               'imageData': iconContext.getImageData(
                  0, 0, iconCanvas.width, iconCanvas.height),
               'tabId': tabId
            });
         });         
      }

      this.StartProgressAnimation = function()
      {
         step = 0;

         // Only bother with re-creating an interval if one doesn't exist!
         // (this also prevents having two intervals, and only canceling the
         // last one, and the other running forever.)
         if (animationInterval == null)
         {
            animationInterval = window.setInterval(function()
            { 
               chrome.tabs.getSelected(null, function (currentTab)
               {
                  animationStep(currentTab.id);
               });
            }, 100);
         }
      }

      function resetAnimationToStep0()
      {
         step=0;
         chrome.tabs.getSelected(null, function (currentTab)
         {
            animationStep(currentTab.id);
         });           
      }

      this.StopProgressAnimation = function ()
      {
         if (animationInterval != null)
         {
            window.clearInterval(animationInterval);
            animationInterval = null;

            resetAnimationToStep0();          
         }
      }

      function updatePageActionInTab(tabid)
      {
         if (!ReadItLater.IsAuthenticated())
         {
            rilBrowserAction.SetIcon("browseraction-warning.png", tabid);
            chrome.browserAction.setTitle({
                "title": "Please open the 'options' and your Read It Later username and password.",
                "tabId": tabid
            });
            chrome.browserAction.setBadgeText({
               "text": ""
            });

            return;
         }

         chrome.tabs.get(tabid, function(currentTab)
         {
            var prefix = "";
            var extId = getCurrentExtensionId();
            if (extId == "emmipommckkdgmeoafdhfoljfjgkloma")
            {
               prefix = "[BETA] ";
            }
            else if (extId != "bkikpncfbjndhfkipijhdoddiadaipaa")
            {
               prefix = "[UNPACKED] ";
            }

            if ((currentTab.url.substring(0,7) != "http://") &&
                 (currentTab.url.substring(0,8) != "https://") &&
                 (currentTab.url.substring(0,7) != "file://"))
            {
               // Not either http or https - don't allow un/mark as read
               setIconForTab("browseraction-notaddable.png", tabid);
               chrome.browserAction.setTitle({
                  "title": prefix + "Show Read It Later List",
                  "tabId": tabid
               });

               return;
            }

            var state = ReadItLater.GetUrlState(currentTab.url);

            var icon, title;
            var indicateWhenRead = 
               (typeof(localStorage['indicateWhenRead']) != 'undefined') &&
                  (localStorage['indicateWhenRead'] == 1);
            if (state == 0) // state == 0 means "unread"
            {
               icon = "browseraction-unread.png";
               title = "This page has been marked to Read It Later";
            }
            else if (state == 1 && indicateWhenRead) // state == 1 means "read"
            {
               icon = "browseraction-read.png";
               title = "This page has been read";
            }
            else // neither read nor unread
            {
               icon = "browseraction-notadded.png";
               title = "Read This Page Later";
            }
            setIconForTab(icon, tabid);
            chrome.browserAction.setTitle({
               "title": prefix + title,
               "tabId": tabid
            });
         });
      }      

      this.UpdateAllTabs = function ()
      {
         chrome.windows.getAll({populate: true}, function(windows) {
            for (var i = 0; i < windows.length; i++) {
               for (var j = 0; j < windows[i].tabs.length; j++) {
                  updatePageActionInTab(windows[i].tabs[j].id);
               }
            }
         });

         var unread = 0;
         if ((typeof(localStorage['showUnreadCountBadge']) == 'undefined') ||
               (localStorage['showUnreadCountBadge'] == 1))
         {
            unread = ReadItLater.GetUnreadCount();
         }

         if (unread > 0)
         {
            chrome.browserAction.setBadgeText({
               "text": "" + unread
            });
            chrome.browserAction.setBadgeBackgroundColor({
               "color": [71, 39, 24, 128]
            });
         }
         else
         {
            chrome.browserAction.setBadgeText({
               "text": ""
            });
         }         
      }
   }

   return function() {
      if (singleInstance == null)
      {
         singleInstance = new RILBrowserAction();
         singleInstance.Init();
      }
      return singleInstance;
   };

})();

