/*\
title: $:/plugins/tiddlywiki/multiwikiserver/routes/handlers/post-bag-tiddlers.js
type: application/javascript
module-type: mws-route
\*/
(function () {

exports.method = "POST";
exports.path = /^\/bags\/([^\/]+)\/tiddlers\/$/;
exports.bodyFormat = "stream";
exports.csrfDisable = true;
exports.useACL = true;
exports.entityName = "bag";

exports.handler = function (request, response, state) {
	const processIncomingStream = require("$:/plugins/tiddlywiki/multiwikiserver/routes/helpers/multipart-forms.js").processIncomingStream;

	// Get the parameters
	var bag_name = $tw.utils.decodeURIComponentSafe(state.params[0]);

	processIncomingStream({
		store: $tw.mws.store,
		state: state,
		response: response,
		bag_name: bag_name,
		callback: function (err, results, fields) {
			if (err) {
				return state.sendResponse(500, { "Content-Type": "text/plain" }, err.toString());
			}

			// Check if this is a move operation
			if (fields && fields.operation === "move") {
				try {
					// Get source bag and target bag from form fields
					const sourceBag = fields["source-bag"];
					const targetBag = fields["bag-name"];

					let selectedTiddlers = fields["selected_tiddlers"];

					// Debug logging
					console.log("Selected tiddlers before array check:", selectedTiddlers);

					// Ensure we have an array even if only one tiddler is selected
					selectedTiddlers = Array.isArray(selectedTiddlers) ? selectedTiddlers : (selectedTiddlers ? [selectedTiddlers] : []);

					console.log("Selected tiddlers after array check:", selectedTiddlers);

					if (!selectedTiddlers || selectedTiddlers.length === 0) {
						return state.sendResponse(400, { "Content-Type": "text/plain" }, "No tiddlers selected");
					}

					// Track successful moves
					const movedTiddlers = [];

					// Move each selected tiddler
					selectedTiddlers.forEach(tiddlerTitle => {
						if (tiddlerTitle) {
							const tiddlerInfo = $tw.mws.store.getBagTiddler(tiddlerTitle, sourceBag);
							if (tiddlerInfo) {
								$tw.mws.store.saveBagTiddler(tiddlerInfo.tiddler, targetBag);
								$tw.mws.store.deleteTiddler(tiddlerTitle, sourceBag);
								movedTiddlers.push(tiddlerTitle);
							}
						}
					});

					// Return success response
					if (request.headers.accept && request.headers.accept.indexOf("application/json") !== -1) {
						state.sendResponse(200, { "Content-Type": "application/json" }, JSON.stringify({
							"moved-tiddlers": movedTiddlers,
							"from-bag": sourceBag,
							"to-bag": targetBag
						}));
					} else {
						// Send HTML response with confirmation message
						state.sendResponse(200, { "Content-Type": "text/html" }, `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Move Complete</title>
				<meta http-equiv="refresh" content="2;url=/bags/${sourceBag}/">
			</head>
			<body>
				<h1>Move Complete</h1>
				<p>Successfully moved ${movedTiddlers.length} tiddler(s)</p>
				<p>Redirecting back to bag...</p>
			</body>
			</html>
		`);
					}
				} catch (e) {
					state.sendResponse(500, { "Content-Type": "text/plain" }, e.message);
				}
			} else if (fields && fields.operation === "move-confirm") {
				try {
					// Get the selected tiddlers
					const selectedTiddlers = Array.isArray(fields.selected_tiddlers) ?
						fields.selected_tiddlers :
						[fields.selected_tiddlers];

					const sourceBag = fields["source-bag"];
					const targetBag = fields["target-bag"];

					if (!response.headersSent) {
						response.writeHead(200, "OK", {
							"Content-Type": "text/html"
						});
						var html = $tw.mws.store.adminWiki.renderTiddler("text/plain",
							"$:/plugins/tiddlywiki/multiwikiserver/templates/confirm-move", {
							variables: {
								"source-bag": sourceBag,
								"target-bag": targetBag,
								"selected-tiddlers": JSON.stringify(selectedTiddlers)
							}
						});
						response.write(html);
						response.end();
					}
				} catch (e) {
					state.sendResponse(500, { "Content-Type": "text/plain" }, e.message);
				}
			} else {
				// Handle file upload response (existing code)
				if (request.headers.accept && request.headers.accept.indexOf("application/json") !== -1) {
					state.sendResponse(200, { "Content-Type": "application/json" }, JSON.stringify({
						"imported-tiddlers": results
					}));
				} else {
					if (!response.headersSent) {
						response.writeHead(200, "OK", {
							"Content-Type": "text/html"
						});
						response.write(`<!doctype html><head><meta http-equiv="Content-Type" content="text/html;charset=utf-8" /></head><body>`);
						var html = $tw.mws.store.adminWiki.renderTiddler("text/html", "$:/plugins/tiddlywiki/multiwikiserver/templates/post-bag-tiddlers", {
							variables: {
								"bag-name": bag_name,
								"imported-titles": JSON.stringify(results)
							}
						});
						response.write(html);
						response.write(`</body></html>`);
						response.end();
					}
				}
			}
		}
	});
};

})();