/* All the communication with other extensions */
var RILForeignRelationsSingleton = (function()
{
   var singleInstance = null;
   function RILForeignRelations()
   {
      var clients = {}; // "client" extensions that have connected to us

      this.Init = function()
      {
         chrome.extension.onConnectExternal.addListener(function (port)
         {
            if ((!port) || (!port.sender) || (!port.sender.id))
            {
               console.log("Got external connect request without sender." +
                  " Ignoring. Port request: " + JSON.stringify(port));
               return;
            }

            clients[port.sender.id] = {'port': port};

            port.onDisconnect.addListener(function () {
               clients[port.sender.id] = null;
            });
         });

         chrome.extension.onRequestExternal.addListener(
         function (request, sender, callback)
         {
            if ( (!request) || (!sender) || (!callback) ) return;

            if (request.cmd == 'RIL.getUrlState')
            {
               if (!request.url) return;
               callback(ReadItLater.GetUrlState(request.url));
            }
            else if (request.cmd == 'RIL.toggleCurrentTabUnread')
            {
               toggleCurrentTabUnread(function (response)
               {
                  callback(response);
               });
            }
         });

         ReadItLater.AddEventListener('onUrlStateChanged', function(url)
         {
            if (!url) return;

            for (var i in clients)
            {
               var client = clients[i];
               if (!client) continue;
               try
               {
                  client.port.postMessage({
                     'cmd': 'RIL.onUrlStateChanged',
                     'url': url,
                     'state': ReadItLater.GetUrlState(url)
                  });
               }
               catch (e)
               {
                  // Error sending message, must be disconnected. Don't try
                  // again.
                  console.warning('Error posting message to ' + i + ': ' + e);
                  clients[i] = null;
               }
            }
         });
      }
   }

   return function() {
      if (singleInstance == null)
      {
         singleInstance = new RILForeignRelations();
         singleInstance.Init();
      }
      return singleInstance;
   };

})();

