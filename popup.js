var PopupSingleton = (function()
{
   function PopupImplementation()
   {
      // Reference to background scripts.
      var bg = null;
      // Port connection to background, to get the "onDisconnect" to fire
      // when the popup closes
      var bgPort = null;

      var cachedAllItemsByDates = null, 
         cachedItemsForPagination = null, cachedTags = null;
      var filters = { };
      var itemsPerPage;

      function normalizeItemsPerPage()
      {
         // If the user set the number of items per page, start from that.
         if (typeof(localStorage['itemsPerPage']) != 'undefined')
         {
            itemsPerPage = parseInt(localStorage['itemsPerPage']);
            itemsPerPage = (itemsPerPage < 1) ? 1 : itemsPerPage;
            // limit number of items to 9, since max size of popup is 800x600
            // and currently each item is about 500 px in height, and the rest
            // is overhead (Add/Remove controls, paging, header tools)
            itemsPerPage = (itemsPerPage > 9) ? 9 : itemsPerPage;
         }
         else
         {
            itemsPerPage = 9;
         }
         // Save that number for later.
         localStorage['itemsPerPage'] = itemsPerPage;
      }

      function getNumItemsThatCanFitInWindow(currentWindow)
      {

         return {'itemsThatFit': itemsThatFit};
      }

      function initListDisplay()
      {
         bg = chrome.extension.getBackgroundPage();

         normalizeItemsPerPage();

         chrome.windows.getCurrent(function(currentWindow)
         {
            var maxHeightOfPopup = 590;
            var popupNonItemSpace = 120; // height of header & footer
            var heightPerItem = 54; // height (including padding & margins)
            var distanceOfPopupFromWindow = 130;

            var popupStartsFrom =
               (currentWindow.top > 0) ? currentWindow.top : 0;
            popupStartsFrom = popupStartsFrom + distanceOfPopupFromWindow;
            var popupEndsAt = screen.availHeight;
            var popupAvailableHeight = popupEndsAt - popupStartsFrom;
            if (popupAvailableHeight > maxHeightOfPopup)
            {
               popupAvailableHeight = maxHeightOfPopup;
            }

            var itemsThatFit = parseInt(
               (popupAvailableHeight - popupNonItemSpace) / heightPerItem);
            itemsThatFit = (itemsThatFit < 1) ? 1 : itemsThatFit;
            
            // OK, so we know a bunch of stuff:
            //
            // popupAvailableHeight = this is how much "room" (height) we have
            //   for the popup. This is important when the screen's height is
            //   very small, such as in small laptops with 16:9 AR
            // itemsThatFit = This is the number of items that can be fit into
            //   the popupAvailableHeight
            // itemsPerPage = This is the number of items the users actually
            //   asked us to put into the popup. It'll later reflect how many
            //   items we're actually displaying
            //
            // We want to put as many items as possible into the popup, without
            // overflowing the height.

            // Make sure we don't put more items than can fit
            itemsPerPage = (itemsPerPage > itemsThatFit) ? 
               itemsThatFit : itemsPerPage;
               
            // Resize te popup to fit those items
            var listContainerHeight = itemsPerPage * heightPerItem;
            var popupHeight = listContainerHeight + popupNonItemSpace;
            $("html").css('overflow', 'hidden');
            $("html").height(popupHeight);
            $("#listcontainer").height(listContainerHeight);
         });

         bgPort = chrome.extension.connect({"name": "popup"});

         filters.page = 0;
         if (localStorage['lastPopupPageViewed'])
         {
            filters.page = parseInt(localStorage['lastPopupPageViewed']);
            console.log("Using 'lastPopupPageViewed' with value "
                  + filters.page + ".");
         }

         filters.search = '';
         filters.limitTo = 'unread';

         var unreadOrReadElement = $('#unreadorread')
         unreadOrReadElement.on('click', function(evtObj)
         {
            // Do not react to clicks if disabled
            if (unreadOrReadElement.hasClass('disabled'))
            {
               return false;
            }
            else if (unreadOrReadElement.hasClass('remove'))
            {
               markCurrentTabAsRead();
               return;
            }
            else
            {
               if (localStorage['askfortagsonadd'] != 1)
               {
                  addCurrentTabToUnread();
               }
               else
               {
                  $('#headertoolbar').hide();

                  $('#tags').show();
                  $('#tagstext').focus();

                  // TODO: if this was marked as read in the past, populate the
                  //       #tagstext with the last values of the item's tags

                  chrome.tabs.getSelected(null, function(tab)
                  {
                     // if the popup was closed while the user was editing tags,
                     // we should mark the item as unread anyway.
                     bgPort.postMessage({
                           'message': 'tagseditingdelayingadd',
                           'url': tab.url,
                           'title': tab.title
                     });
                  });
               }
            }         
         });


         _('refresh').addEventListener('click', function()
         {
            refresh();
            return false;
         }, true);

         _("next").addEventListener('click', function()
         {
            nextPage();
         }, true);

         _("prev").addEventListener('click', function()
         {
            prevPage();
         }, true);

         _("pages").addEventListener('click', function(e)
         {
            var p = e.target.getAttribute('page');
            if (p.length > 0)
            {
               filters.page = p - 1;
               populatePopupList(cachedAllItemsByDates);
            }
         }, true);

         var filter = _("filter");
         filter.addEventListener('focus', function()
         {
            filter.className = "";
			if (filter.value == "Filter by title, url, or tag")
            {
				filter.value = "";
				filters.search = "";
			}
         }, true);

         filter.addEventListener('blur', function()
         {
            if (filter.value.length == 0)
            {
               filter.className = "reset";
               filter.value = "Filter by title, url, or tag";
            }
         }, true);

         filter.addEventListener('keyup', function()
         {
            filters.page = 0;
            filters.search = filter.value;
            populatePopupList(cachedAllItemsByDates);
         }, true);

         var sortByElement = _("sortby");
         var updateSortBy = function (sortByVal)
         {
            if (filter.sort != sortByVal)
            {

            }
         };
         sortByElement.addEventListener('change', function()
         {
            filters.sort =
               sortByElement.options[sortByElement.selectedIndex].value;
            localStorage['popup.lastSortBy'] = filters.sort;

            populatePopupList(cachedAllItemsByDates);
         }, true);

         // Load the last-set sorting method
         if (localStorage['popup.lastSortBy'])
         {
            sortByVal = localStorage['popup.lastSortBy'];

            for (var i=0; i<sortByElement.options.length; ++i)
            {
               if (sortByElement.options[i] &&
                     sortByElement.options[i].value == sortByVal)
               {
                  sortByElement.selectedIndex = i;
               }
            }

            filters.sort =
               sortByElement.options[sortByElement.selectedIndex].value;
         }

         /* List-of-items Selector: either "Read" or "Unread" */

         var listUnreadTitle = _('listunread');
         var listReadTitle = _('listread');

         listUnreadTitle.addEventListener('click', function()
         {
            if (listUnreadTitle.className != 'active')
            {
               filters.limitTo = 'unread';
               sendRequestGetAllItemsByDate();
               listUnreadTitle.className = 'active';

               listReadTitle.className = '';
            }
         }, true);

         listReadTitle.addEventListener('click', function()
         {
            if (listReadTitle.className != 'active')
            {
               filters.limitTo = 'read';
               sendRequestGetAllItemsByDate();
               listReadTitle.className = 'active';

               listUnreadTitle.className = '';
            }
         }, true);

         $('#tags').on('submit', function(evtObj)
         {
            addCurrentTabToUnread($('#tagstext').val());
            return false;
         });
         
         /* All the pre-display init is complete. Now display the content of
          * the popup! */
         chrome.tabs.getSelected(null, function(tab)
         {
            populatePopupContent(tab);
         });         
      }

      function initLoginDisplay()
      {

      }

      function initDisplay()
      {
         if (!bg.ReadItLater.IsAuthenticated())
         {
            $('html').addClass('login');
            initLoginDisplay();  
         }
         else
         {
            $('html').addClass('nonlogin');
            initListDisplay();
         }
      }

      this.ReInitDisplay = function ()
      {
         initDisplay();
      }

      this.Init = function ()
      {
         bg = chrome.extension.getBackgroundPage();

         initDisplay();
      }

      function _(o) { return document.getElementById(o); }

      /* Takes a unix time (seconds from epoch) */
      function timeAgo(unixTime, roundToHours) {
          var nowTime = bg.ReadItLater.GetNowAsRILTime();
          var passedSeconds = nowTime - unixTime;

          var timePassed, num;
          if (passedSeconds > 86400) {
              num = Math.ceil(passedSeconds / 86400);
              timePassed = num + " day";
          }
          else if (passedSeconds > 3600) {
              num = Math.ceil(passedSeconds / 3600);
              timePassed = num + " hour";
          }
          else if (roundToHours)
          {
              num = 0.5;
              timePassed = "less then an hour";
          }          
          else if (passedSeconds > 60) {
              num = Math.ceil(passedSeconds / 60);
              timePassed = num + " minute";
          }
          else {
              num = Math.ceil(passedSeconds);
              timePassed = num + " second";
          }
          timePassed += (num > 1) ? "s ago" : " ago";

          return timePassed;
      }

      function buildDOMForItem(title, url, hostname, tags, when, whenTooltip,
            showDelete)
      {
          /* Build icon */
          var faviconURL = "chrome://favicon/" + hostname;

          /* Add the item */
          var li = document.createElement('li');
          li.className = 'editable';
          li.setAttribute('riltags', tags);
          var img = document.createElement('img');
          img.src = faviconURL;
          li.appendChild(img);
          var itembody = document.createElement('div');
          itembody.className = 'itembody';
          li.appendChild(itembody);
          var link = document.createElement('div');
          link.className = 'link';
          link.setAttribute('href', url);
          link.setAttribute('target', '_blank');
          link.addEventListener('mousedown', 
                function (e) { return pop.OpenItem(this, e); }, true);
          // clip title to make sure it fits
          link.innerHTML = title.substr(0,78); 
          itembody.appendChild(link);
          var details = document.createElement('div');
          details.className = 'details';
          var hostnameDOM = document.createElement('span');
          hostnameDOM.className = 'hostname';
          hostnameDOM.innerHTML = hostname;
          details.appendChild(hostnameDOM);
          // Only add the date if we've been given it
          if ((when != null) && (when.length > 0))
          {
             var whenDOM = document.createElement('span');
             whenDOM.className = 'when';
             whenDOM.setAttribute('title', whenTooltip);
             whenDOM.innerHTML = ' (added ' + when + ')';
             details.appendChild(whenDOM);
          }
          itembody.appendChild(details);
          li.appendChild(itembody);

          var controls = document.createElement('div');
          controls.className = 'controls';
          if (showDelete)
          {
             var deleteDOM = document.createElement('div');
             deleteDOM.className = 'delete';
             deleteDOM.addEventListener('click',
                function (e) { return pop.DeleteItem(this); }, true);
             deleteDOM.setAttribute('title', 'Delete this item');
             controls.appendChild(deleteDOM);
          }
          var textDOM = document.createElement('div');
          textDOM.className = 'text';
          textDOM.setAttribute('title', 'Open a text-only view of the item in another window');
          textDOM.addEventListener('click', 
             function (e) { return pop.TextView(this); }, false);
          controls.appendChild(textDOM);
          var editDOM = document.createElement('div');
          editDOM.className = 'edit';
          editDOM.setAttribute('title', 'Edit this item');
          editDOM.addEventListener('click', 
             function (e) { return pop.EditItem(this); }, false);
          controls.appendChild(editDOM);
          var flipDOM = document.createElement('div');
          flipDOM.className = 'onlist';
          flipDOM.addEventListener('click', 
             function (e) { return pop.FlipItem(this); }, false);
          controls.appendChild(flipDOM);
          li.appendChild(controls);

          return li;
      }

      function itemMatches(item, needle)
      {
         var s = needle.toLowerCase();
		 if(item.tags != null){
			var t = s.split(",");
			var tagMatch = true;
			for (var i=0; i<t.length; i++)
			{
				t[i]=t[i].replace(/^\s\s*/, '').replace(/\s\s*$/, '');
				if(t[i].length > 0)
				{
					if(item.tags.toLowerCase().indexOf(t[i]) == -1)
					{
						tagMatch = false;
						break;
					}	
				}
			}
		}else{
			var tagMatch = false;
		}
		if (
            (((item.title != null)
               && (item.title.toLowerCase().indexOf(s) != -1)) ||
            ((item.url != null)
               && (item.url.toLowerCase().indexOf(s) != -1)) ||
            (tagMatch))
          )
         {
            return true;
         }

         return false;
      }

      function sortByOldest(a,b) { return (parseInt(a.time_updated) > parseInt(b.time_updated)) ? 1 : -1; }
      function sortByNewest(a,b) { return (parseInt(a.time_updated) > parseInt(b.time_updated)) ? -1 : 1; }
      function sortByTitle(a,b) { return (a.title.toLowerCase() > b.title.toLowerCase()) ? 1 : -1; }
      function sortBySite(a,b)
      {
         var hostA = null, hostB = null;
         try
         {
            hostA = jQuery.url.setUrl(a.url).attr("host");
         }
         catch (e)
         {
            console.log("jQuery.url threw exception in setUrl. URL: \""
                  + a.url + "\". Exception: " + e);
         }
         try
         {
            hostB = jQuery.url.setUrl(b.url).attr("host");
         }
         catch (e)
         {
            console.log("jQuery.url threw exception in setUrl. URL: \""
                  + b.url + "\". Exception: " + e);
         }

         if (hostA == null && hostB == null)
         {
            return 0;
         }
         else if (hostA == null)
         {
            return -1;
         }
         else if (hostB == null)
         {
            return 1;
         }
         else {
            return (hostA.toLowerCase() > hostB.toLowerCase()) ? 1 : -1;
         }
      }

      function getMatchingListItems(listByDates, filterCriteria)
      {
          console.log('buildListCache()');

          /* Use default criteria if none specified */
          criteria = filterCriteria || filters;
          // TODO: do I need this?
          if (typeof(criteria.limitTo) == 'undefined')
          {
             criteria.limitTo = 'unread';
          }

          /* Sort a copy of the list, if the filtering says so */
          var list = [];
          for (var i=0; i<listByDates.length; ++i)
          {
             list[i] = listByDates[i];
          }
          if (typeof(criteria.sort) != 'undefined')
          {
             var sortFunc = null;
             if (criteria.sort == 'oldest') { sortFunc = sortByOldest; }
             else if (criteria.sort == 'title') { sortFunc = sortByTitle; }
             else if (criteria.sort == 'site') { sortFunc = sortBySite; }
             else { sortFunc = sortByNewest; }

             list.sort(sortFunc);
          }

          /* Find all the items in the list that match the criteria */
          var matchingCount=0;
          var matchingList = [];
          for (var i=0; i<list.length; ++i)
          {
             var item = list[i];

             /* Skip any items not matching the "limitTo" criteria */
             if (((item.state != 0) && (criteria.limitTo == 'unread')) ||
                 ((item.state != 1) && (criteria.limitTo == 'read')))
             {
               continue;
             }

             /* Skip any items not matching the "search" criteria */
             if ((typeof(criteria.search) != "undefined") &&
                   !itemMatches(item, criteria.search))
             {
               continue;
             }

             matchingList.push(item);
          }

          return matchingList;
      }

      function populatePopupList(listByDates, filterCriteria)
      {
         console.log('populatePopupList()');

         /* Use default criteria if none specified */
         criteria = filterCriteria || filters;

         list = getMatchingListItems(listByDates, criteria);

         var counted=0;
         var paginationItems = [];
         var itemListDOM = document.createElement('ul');
         var firstItem = itemsPerPage * criteria.page;
         localStorage['lastPopupPageViewed'] = criteria.page;
         for (var i=0; i<list.length; ++i)
         {
            var item = list[i];

            /* Display the item */

            var jUrl = null;
            try
            {
               jUrl = jQuery.url.setUrl(item.url);
            }
            catch (e)
            {
               console.log("jQuery.url threw exception in setUrl. URL: \"" +
                  item.url + "\". Exception: " + e);
            }

            // if no title, use the filename from the URL
            var title = item.title;
            if (title == null || title.length == 0)
            {
               if (jUrl != null)
               {
                  title = jUrl.attr("file");
               }
               else
               {
                  // if URL is unparsable, just use the URL
                  title = item.url;
               }

               // Well, if it's still null or empty that means there's
               // no file, and it's the root-document (index.html).
               if (title == null || title.length == 0)
               {
                  title = "index.html";
               }

               // We will also ask the background page to try to resolve
               // the item's title by accessing the website
               bgPort.postMessage({
                  'message': 'resolveMissingTitle',
                  'url': item.url
               });
            }

            var host = null;
            if (jUrl != null)
            {
               var port = jUrl.attr("port");
               host = jUrl.attr("host") +
                  ((port==null || port==80) ? '' : (':' + port));
            }
            else
            {
               host = "-error parsing url-";
            }
            var tags = item.tags ? item.tags : '';

            /* Only display items until to fill the current page */
            if ((i >= firstItem) && (counted < itemsPerPage))
            {
               try
               {
                  var when = "";
                  var whenTooltip = "";
                  var showDeleteButton = false;
                  if (localStorage['showdateinpopup'] == 1)
                  {
                     when = timeAgo(item.time_added, true);
                     whenTooltip =
                        new Date(item.time_added * 1000).toDateString();
                  }
                  if(localStorage['showdeleteinpopup'] == 1)
                  {
                     showDeleteButton = 1;
                  }
                  
                  itemListDOM.appendChild(
                        buildDOMForItem(title, item.url, host, tags,
                           when, whenTooltip, showDeleteButton));
                  ++counted;
               }
               catch (e)
               {
                  console.error("Exception: " + e +
                        " while building item for " + JSON.stringify(item));
               }
            }

            /* Store ALL of the items (even those that don't fit on the page)
             * in a list, for later pagination (so that next/prev buttons work)
             */
            paginationItems.push(item);
         }

         _('list').innerHTML = "";
         _('list').appendChild(itemListDOM);

         cachedItemsForPagination = paginationItems;
         updatePageControls();
      }

      function updateControls(tab) {
          var addable = false;
          var removable = false;

          if (tab.url.substring(0,6) != "chrome")
          {
              var state = bg.ReadItLater.GetUrlState(tab.url);

              removable = (state == 0); // state == 0 means "unread"
              addable = !removable;
          }

          var unreadorread = $('#unreadorread');
          unreadorread.removeClass('disabled');
          unreadorread.removeClass('remove');
          unreadorread.removeClass('add');
          if (removable)
          {
             unreadorread.addClass('remove');
          }
          else if (addable)
          {
             unreadorread.addClass('add');
          }
          else
          {
             unreadorread.addClass('disabled');
          }

          updatePageControls();
      }

      function populatePopupContent(tab)
      {
          updateControls(tab);
          sendRequestGetAllItemsByDate();
      }

      function sendRequestGetAllItemsByDate()
      {
          chrome.extension.sendRequest(
              {'command': 'GetAllItemsByDate'},
              function(response) {
                  cachedAllItemsByDates = response;
                  populatePopupList(response);
              }
          );
      }

      function markCurrentTabAsRead() {
         chrome.tabs.getSelected(null, function(tab)
         {
            chrome.extension.sendRequest(
               {'command': 'markRead', 'url': tab.url},
               function(response) {
                  updateControls(tab);
                  cachedAllItemsByDates = response;
                  populatePopupList(response);
                  window.close();
               });
         });
      }

      function addCurrentTabToUnread(tags) {
         chrome.tabs.getSelected(null, function(tab)
         {
            var options = {'command': 'markCurrentTabUnread'};
            if (tags)
            {
               options.tags = tags;
            }

            chrome.extension.sendRequest(
               options,
               function(response)
               {
                  window.close();
               });
          });
      }

      function refresh() {
          chrome.extension.sendRequest(
              {'command': 'refresh'},
              function(response) {
                  cachedAllItemsByDates = response;
                  populatePopupList(response);
              }
          );
      }

      function nextPage()
      {
         if (filters.page+1 < (cachedItemsForPagination.length / itemsPerPage))
         {
            ++filters.page;
            populatePopupList(cachedAllItemsByDates);
         }
      }

      function prevPage()
      {
         if (filters.page > 0)
         {
            --filters.page;
            populatePopupList(cachedAllItemsByDates);
         }
      }

      function calcPageNumbers(pageNum, filters)
      {
         // We have a fixed with of ~600 pixels. We MUST fit the following:
         // prev, next, page1, last-page, and a '...'
         // The rest of the space is to fit as many page-numbers as we can,
         // that surround the current page number.
         var availWidth = 230;
         var pageWidth = 25;
         var fitNum = Math.floor(availWidth / pageWidth) - 3;
         fitNum -= (fitNum % 2 == 0) ? 1 : 0;

         var adjacentRadius = Math.floor((fitNum - 1) / 2);
         var start = filters.page + 1 - adjacentRadius;
         start = (start < 1) ? 1 : start;
         var finish = filters.page + 1 + adjacentRadius;
         finish = (finish > pageNum) ? pageNum : finish;

         if (finish - start + 1 < fitNum)
         {
            if (start == 1)
            {
               finish = start + fitNum - 1;
               finish = (finish > pageNum) ? pageNum : finish;
            }
            else if (finish == pageNum)
            {
               start = finish - fitNum + 1;
               start = (start < 1) ? 1 : start;
            }
         }

         var putStartEllipsis = (start > 2);
         var putFinishEllipsis = (finish < (pageNum - 1));

         return {
            'start':  start,
            'finish': finish,
            'putStartEllipsis':  putStartEllipsis,
            'putFinishEllipsis': putFinishEllipsis
         };
      }

      function updatePageControls()
      {
         if (cachedItemsForPagination == null) { return; }

         var pageNum = Math.ceil(
               cachedItemsForPagination.length / parseFloat(itemsPerPage));

         _('next').className = 'toolbaritem' +
            ((filters.page < pageNum-1) ? '' : ' disabled');

         _('prev').className = 'toolbaritem' +
           ((filters.page > 0) ? '' : ' disabled');

         function makeLi(p)
         {
            return '<li page="PAGE" CLASS>PAGE</li>'
               .replace(/PAGE/g, p)
               .replace('CLASS',
                     ((p-1 == filters.page) ? 'class="selected"' : ''));
         }

         var pagesAttrs = calcPageNumbers(pageNum, filters);

         var pages = '';
         if (pagesAttrs.start > 1)
         {
            pages += makeLi(1);
            pages += (pagesAttrs.putStartEllipsis) ? 
               '<li class="ellips">&hellip;</li>' : '';
         }
         for (var i=pagesAttrs.start; i <= pagesAttrs.finish; ++i)
         {
            pages += makeLi(i);
         }
         if (pagesAttrs.finish < pageNum)
         {
            pages += (pagesAttrs.putFinishEllipsis) ? 
               '<li class="ellips">&hellip;</li>' : '';
            pages += makeLi(pageNum);
         }
         _('pages').innerHTML = pages;
         _('pages').selectedIndex = filters.page;
      }

      // escape &'s and "'s               
      function escapeQuotes(s)
      {
         return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      }

      this.EditItem = function(target)
      {
         removeAllEditingControls();

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

         var li = jQuery(target).parents('li');
         li.addClass('editing');
         li.removeClass('editable');
         var link = li.find('.link')[0];
         var item = li.find('.itembody');
         var tags = li.attr('riltags');

         var editContainer = document.createElement('form');
         editContainer.className = 'itemeditbody';

         var titleElement = editContainer.appendChild(
               document.createElement('input'));
         titleElement.id = 'edittitle';
         titleElement.type = 'text';
         titleElement.value = link.innerHTML;

         editContainer.appendChild(document.createElement('br'));

         var tagsElement = editContainer.appendChild(
               document.createElement('input'));
         tagsElement.id = 'edittags';
         tagsElement.type = 'text';
         tagsElement.value = tags ? tags : '';
         tagsElement.placeholder = 'tags, separated by commas';
         
         var saveButton = editContainer.appendChild(
               document.createElement('input'));
         saveButton.id = 'savebutton';         
         saveButton.type = 'submit';
         saveButton.value = 'Save';

         editContainer.onsubmit = function(){
            pop.SaveEditedItem(li);
            return false;
         };

         item.hide();
         $(editContainer).insertAfter(item);

         var edittags = $('#edittags');
         edittags.autocomplete({
            minChars: 1,
            delimiter: /,\s*/,
            maxHeight: 400,
            width: 300,
            noSuggestExisting: true,
            lookup: function ()
            {
               var l=[];
               for(var k in cachedTags)
                  // only show tags not selected
                  l.push(k);
               return l;
            },
               //return ;
            'onSelect': function(value, data)
            { 
               li.attr('riltags', li.attr('riltags') + ',' + value)
            }
         });

         var itemeditbody = item.parent().children('.itemeditbody');
      }

      this.OpenItem = function(targetElement, evt)
      {
         var middleClick = (evt.button == 1);

         var markItemRead =
            (localStorage['markunreaditemsasread'] == 1);
         var openItemsWithoutClosingPopup =
            (localStorage['openitemswithoutclosingpopup'] != 0) || middleClick;

         var link = jQuery(targetElement).parents('li').find('.link')[0];
         var url = link.getAttribute('href');
         chrome.tabs.create({
               'url': url,
               'selected': !openItemsWithoutClosingPopup,
               'active': !openItemsWithoutClosingPopup,
            },
            function (tab) {
               if (markItemRead)
               {
                  chrome.extension.sendRequest(
                     {'command': 'markRead', 'url': url},
                     function(response) { });
               }
            });

         evt.preventDefault();
         evt.cancelBubble = true;
         return false;
      };

      this.TextView = function(targetElement)
      {
         var link = jQuery(targetElement).parents('li').find('.link')[0];
         chrome.extension.sendRequest(
            {
               'command': 'textViewItemUsingReadItLater',
               'url': link.getAttribute('href')
            },
            function(response) {
               // Nothing to do on "success"...
            });
         window.close();
      }

      function removeAllEditingControls()
      {
         jQuery('#list .itemeditbody').remove();
         var edited = jQuery('#list .editing');
         edited.removeClass('editing');
         edited.addClass('editable');
         edited.find('.itembody').show();
      };

      function addTag(tagText, replaceLastTag)
      {
         var edittags = _('edittags');
         if (edittags)
         {
            var tags = edittags.value.split(',');

            // Trim left/right whitespaces
            for (var i=0; i<tags.length; ++i)
            {
               tags[i] = tags[i].replace(/^\s\s*/, '').replace(/\s\s*$/, '');
            }

            if (replaceLastTag)
            {
               tags[tags.length-1] = tagText;
            }
            else
            {
               tags.push(tagText);
            }

            edittags.value = tags.join(', ');
         }
      }

      this.SaveEditedItem = function(liOfItem)
      {
         var link = liOfItem.find('.link')[0];
         var newTags = liOfItem.find('#edittags')[0].value;
         var newTitle = liOfItem.find('#edittitle')[0].value;
         // unescape &'s and "'s
         newTitle = newTitle.replace(/&amp;/g, '&').replace(/&quot;/g, '"');

         removeAllEditingControls();

         chrome.extension.sendRequest(
            {
               'command': 'updateItem',
               'url': link.getAttribute('href'),
               'title': newTitle,
               'tags': newTags
            },
            function(response) {
               cachedAllItemsByDates = response;
               populatePopupList(response);
            });
      }

      this.DeleteItem = function(target)
      {
         var li = jQuery(target).parents('li');
         var link = li.find('.link')[0];
         var href = link.getAttribute('href');

         // TODO: confirm, but don't ask again until the user closes the popup

         chrome.extension.sendRequest(
            {'command': 'deleteItem', 'url': href},
            function(response) {
               cachedAllItemsByDates = response;
               populatePopupList(response);
            });
      }

      this.FlipItem = function(target)
      {
         var li = jQuery(target).parents('li');
         var link = li.find('.link')[0];
         var href = link.getAttribute('href');

         if (!li.hasClass('unmarked'))
         {
            li.addClass("unmarked");

            chrome.extension.sendRequest(
               {'command': 'markRead', 'url': href},
               function(response) {
                  // NOTE: we DO NOT want to refresh the list, since that
                  //       will prevent the user from undoing the un/marking
                  //       because the item will have disappeared!
               });
         }
         else
         {
            li.removeClass("unmarked");

            chrome.extension.sendRequest(
               {
                  'command': 'markUnread',
                  'url': href,
                  'title': link.innerHTML
               },
               function(response) {
                  // NOTE: we DO NOT want to refresh the list, since that
                  //       will prevent the user from undoing the un/marking
                  //       because the item will have disappeared!
               });
         }
      }
   }

   var singleInstance = null;
   return function() {
      if (singleInstance == null)
      {
         singleInstance = new PopupImplementation();
         singleInstance.Init();
      }
      return singleInstance;
   };
})();

var pop = null;
$(function()
{
   pop = new PopupSingleton();

   window.onfocus = function() { pop.ReInitDisplay(); }
});

