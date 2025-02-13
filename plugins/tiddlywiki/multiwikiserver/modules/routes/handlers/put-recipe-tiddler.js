/*\
title: $:/plugins/tiddlywiki/multiwikiserver/routes/handlers/put-recipe-tiddler.js
type: application/javascript
module-type: mws-route

PUT /recipes/:recipe_name/tiddlers/:title

\*/
(function () {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.method = "PUT";

exports.path = /^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/;

exports.useACL = true;

exports.entityName = "recipe"

exports.handler = function (request, response, state) {
    // Get the parameters
    var recipe_name = $tw.utils.decodeURIComponentSafe(state.params[0]),
        title = $tw.utils.decodeURIComponentSafe(state.params[1]),
        fields = $tw.utils.parseJSONSafe(state.data);
    if(recipe_name && title === fields.title) {
        var result = null;
        var existingTiddlerInfo = $tw.mws.store.getRecipeTiddler(title, recipe_name);
        
        if (existingTiddlerInfo && existingTiddlerInfo.bag_name) {
            // If we found the existing tiddler, save to its current bag
            result = $tw.mws.store.saveBagTiddler(fields, existingTiddlerInfo.bag_name);
        } else {
            // If it's a new tiddler or not found, save to the recipe's top bag
            result = $tw.mws.store.saveRecipeTiddler(fields, recipe_name);
        }

        if(!response.headersSent) {
            if(result && result.tiddler_id) {
                // Always include these headers
                var headers = {
                    "X-Revision-Number": result.tiddler_id.toString(),
                    "Content-Type": "text/plain"
                };
                
                // Only add Etag and X-Bag-Name if we have a bag name
                if (result.bag_name) {
                    headers["X-Bag-Name"] = result.bag_name;
                    headers["Etag"] = state.makeTiddlerEtag({
                        tiddler_id: result.tiddler_id,
                        bag_name: result.bag_name
                    });
                }
                
                response.writeHead(204, "OK", headers);
            } else {
                response.writeHead(400);
            }
            response.end();
        }
        return;
    }
    // Fail if something went wrong
    if(!response.headersSent) {
        response.writeHead(404);
        response.end();
    }
};

}());
