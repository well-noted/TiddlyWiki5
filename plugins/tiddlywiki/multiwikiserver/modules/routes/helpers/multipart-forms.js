/*\
title: $:/plugins/tiddlywiki/multiwikiserver/routes/helpers/multipart-forms.js
type: application/javascript
module-type: library

A function that handles an incoming multipart/form-data stream
\*/

(function() {

exports.processIncomingStream = function(options) {
	const path = require("path"),
		fs = require("fs");
	const fields = {};
	
	// Process the incoming data
	const inboxName = $tw.utils.stringifyDate(new Date());
	const inboxPath = path.resolve(options.store.attachmentStore.storePath,"inbox",inboxName);
	$tw.utils.createDirectory(inboxPath);
	let fileStream = null;
	let hash = null;
	let length = 0;
	const parts = [];
	
	
	options.state.streamMultipartData({
		cbPartStart: function(headers,name,filename) {
			const part = {
				name: name,
				filename: filename,
				headers: headers
			};
			if(filename) {
				const inboxFilename = (parts.length).toString();
				part.inboxFilename = path.resolve(inboxPath,inboxFilename);
				fileStream = fs.createWriteStream(part.inboxFilename);
			} else {
				part.value = "";
			}
			hash = new $tw.sjcl.hash.sha256();
			length = 0;
			parts.push(part)
		},
		cbPartChunk: function(chunk) {
			if(fileStream) {
				fileStream.write(chunk);
			} else {
				parts[parts.length - 1].value += chunk;
			}
			length = length + chunk.length;
			hash.update(chunk);
		},
		cbPartEnd: function () {
			if (fileStream) {
				fileStream.end();
			}
			fileStream = null;
			parts[parts.length - 1].hash = $tw.sjcl.codec.hex.fromBits(hash.finalize()).slice(0, 64).toString();
			hash = null;

			// Store form field values
			const part = parts[parts.length - 1];
			if (!part.filename) {
				const fieldName = part.name;
				// Handle multiple values for the same field name
				if (fields[fieldName] !== undefined) {
					if (!Array.isArray(fields[fieldName])) {
						fields[fieldName] = [fields[fieldName]];
					}
					fields[fieldName].push(part.value.trim());
				} else {
					fields[fieldName] = part.value.trim();
				}

				// Debug logging
				console.log(`Field "${fieldName}" updated:`, fields[fieldName]);
			}
		},

		cbFinished: function(err) {
    if(err) {
        return options.callback(err);
    }

    console.log("Final fields object:", fields);
    
    // Handle move operation
    if(fields.operation === "move") {
        options.callback(null, [], fields);
        return;
    }
    
    // Find all file parts
    const fileParts = parts.filter(part => part.name === "files-to-upload" && !!part.filename);
    if(fileParts.length === 0) {
        return options.state.sendResponse(400, {"Content-Type": "text/plain"}, "No files to upload");
    }

    const savedTitles = [];

    // Process each file
    for(const filePart of fileParts) {
        const type = filePart.headers["content-type"];
        const tiddlerFields = {
            title: filePart.filename,
            type: type
        };

        // Apply common fields from the form to all files
        for(const part of parts) {
            const tiddlerFieldPrefix = "tiddler-field-";
            if(part.name.startsWith(tiddlerFieldPrefix)) {
                tiddlerFields[part.name.slice(tiddlerFieldPrefix.length)] = part.value.trim();
            }
        }

        // Save each file as a separate tiddler with attachment
        options.store.saveBagTiddlerWithAttachment(tiddlerFields, options.bag_name, {
            filepath: filePart.inboxFilename,
            type: type,
            hash: filePart.hash
        });

        savedTitles.push(tiddlerFields.title);
    }

    // Clean up the inbox directory
    $tw.utils.deleteDirectory(inboxPath);
    
    // Return the list of saved tiddler titles
    options.callback(null, savedTitles, fields);
}
	});
};

})();